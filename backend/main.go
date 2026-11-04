package backend

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const (
	// rootMarker repère la racine du projet (frontend servi par le Web).
	rootMarker          = "index.html"
	serviceModeMonolith = "monolith"
	serviceModeCatalog  = "catalog"
	serviceModeRunner   = "runner"
	serviceModeWeb      = "web"
)

var jsInstructionsDirCandidates = []string{
	"js_exam_instructions",
	"Js_exam_instructions",
}

var (
	rootDir           string
	jsInstructionsDir string
	exercises         []Exercise
	jsExercises       []Exercise
	rustExercises     []Exercise
	javaExercises     []Exercise
)

// Run starts one explicitly selected service. Commands own the service choice,
// preventing deployment configuration from accidentally exposing a component's
// private responsibility.
func Run(mode string) error {
	mode, err := serviceMode(mode)
	if err != nil {
		return err
	}
	if err := initialize(mode); err != nil {
		return err
	}
	if (mode == serviceModeRunner || mode == serviceModeMonolith) && strings.EqualFold(strings.TrimSpace(os.Getenv("RUNNER_MODE")), "docker") {
		workDir, err := runnerWorkDir()
		if err != nil {
			return fmt.Errorf("répertoire Runner: %w", err)
		}
		lifecycle, err = newDockerLifecycle(workDir)
		if err != nil {
			return fmt.Errorf("initialisation Docker Runner: %w", err)
		}
	}
	mux, err := newServiceMux(mode)
	if err != nil {
		return err
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	if !strings.HasPrefix(port, ":") {
		port = ":" + port
	}

	address := strings.TrimSpace(os.Getenv("LISTEN_ADDR"))
	if address == "" {
		address = port
	}
	fmt.Printf("Service %s en écoute sur %s\n", mode, address)
	return http.ListenAndServe(address, mux)
}

func serviceMode(raw string) (string, error) {
	mode := strings.ToLower(strings.TrimSpace(raw))
	switch mode {
	case serviceModeMonolith, serviceModeCatalog, serviceModeRunner, serviceModeWeb:
		return mode, nil
	default:
		return "", fmt.Errorf("composant=%q invalide (monolith, catalog, runner ou web)", raw)
	}
}

func initialize(mode string) error {
	var err error
	rootDir, err = os.Getwd()
	if err != nil {
		return fmt.Errorf("récupération du répertoire courant: %w", err)
	}

	// Support: si on lance depuis backend, remonter à la racine du projet.
	for curr := rootDir; ; {
		if FileExists(filepath.Join(curr, rootMarker)) {
			rootDir = curr
			break
		}
		parent := filepath.Dir(curr)
		if parent == curr {
			break
		}
		curr = parent
	}

	if mode == serviceModeWeb {
		return nil
	}
	if mode == serviceModeRunner {
		return loadRunnerCatalog()
	}
	return initializeCatalog()
}

func initializeCatalog() error {
	var err error
	jsInstructionsDir = resolveJSInstructionsDir(rootDir)

	exercises, err = LoadGoExercises()
	if err != nil {
		fmt.Println("Catalogue Go indisponible:", err)
		exercises = []Exercise{}
	}
	jsExercises, err = LoadJSExercises(jsInstructionsDir)
	if err != nil {
		return fmt.Errorf("chargement exercices JS: %w", err)
	}
	rustExercises, err = LoadRustExercises()
	if err != nil {
		fmt.Println("Catalogue Rust indisponible:", err)
		rustExercises = []Exercise{}
	}
	javaExercises, err = LoadJavaExercises()
	if err != nil {
		fmt.Println("Catalogue Java indisponible:", err)
		javaExercises = []Exercise{}
	}
	return nil
}

func loadRunnerCatalog() error {
	baseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("CATALOG_SERVICE_URL")), "/")
	if baseURL == "" {
		return fmt.Errorf("CATALOG_SERVICE_URL est requis par le composant runner")
	}
	endpoint, err := url.Parse(baseURL + "/internal/runner-catalog")
	if err != nil || endpoint.Scheme == "" || endpoint.Host == "" {
		return fmt.Errorf("CATALOG_SERVICE_URL doit être une URL absolue valide")
	}
	res, err := (&http.Client{Timeout: runTimeout()}).Get(endpoint.String())
	if err != nil {
		return fmt.Errorf("lecture du catalogue Runner: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("lecture du catalogue Runner: HTTP %d", res.StatusCode)
	}
	var catalog RunnerCatalog
	if err := json.NewDecoder(res.Body).Decode(&catalog); err != nil {
		return fmt.Errorf("décodage du catalogue Runner: %w", err)
	}
	exercises, jsExercises = catalogExercises(catalog.Go), catalogExercises(catalog.JS)
	rustExercises, javaExercises = catalogExercises(catalog.Rust), catalogExercises(catalog.Java)
	return nil
}

func newServiceMux(mode string) (*http.ServeMux, error) {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/version", handleVersion)
	switch mode {
	case serviceModeMonolith:
		mux.HandleFunc("/api/exercises", handleExercises)
		mux.Handle("/api/run", newRunGate().wrap(http.HandlerFunc(handleRun)))
		mux.HandleFunc("/", handleStatic)
	case serviceModeCatalog:
		mux.HandleFunc("/api/exercises", handleExercises)
		mux.HandleFunc("/internal/runner-catalog", handleRunnerCatalog)
	case serviceModeRunner:
		mux.Handle("/api/run", newRunGate().wrap(http.HandlerFunc(handleRun)))
	case serviceModeWeb:
		catalogProxy, err := serviceProxy("CATALOG_SERVICE_URL")
		if err != nil {
			return nil, err
		}
		runnerProxy, err := serviceProxy("RUNNER_SERVICE_URL")
		if err != nil {
			return nil, err
		}
		mux.Handle("/api/exercises", catalogProxy)
		mux.Handle("/api/run", runnerProxy)
		mux.HandleFunc("/", handleStatic)
	}
	return mux, nil
}

func serviceProxy(envName string) (http.Handler, error) {
	rawURL := strings.TrimSpace(os.Getenv(envName))
	if rawURL == "" {
		return nil, fmt.Errorf("%s est requis par le composant web", envName)
	}
	target, err := url.Parse(rawURL)
	if err != nil || target.Scheme == "" || target.Host == "" {
		return nil, fmt.Errorf("%s doit être une URL absolue valide", envName)
	}
	return httputil.NewSingleHostReverseProxy(target), nil
}

func handleExercises(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
		return
	}
	track := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("track")))
	list := exercises
	if track == "js" {
		list = jsExercises
	} else if track == "rust" {
		list = rustExercises
	} else if track == "java" {
		list = javaExercises
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(list)
}

func handleRunnerCatalog(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(RunnerCatalog{
		Go: runnerExercises(exercises), JS: runnerExercises(jsExercises),
		Rust: runnerExercises(rustExercises), Java: runnerExercises(javaExercises),
	})
}

func handleRun(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
		return
	}

	if strings.ToLower(strings.TrimSpace(os.Getenv("RUNNER_MODE"))) != "docker" {
		WriteRunResponse(w, false, "Exécution désactivée: RUNNER_MODE doit être 'docker'.")
		return
	}

	var req RunRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		WriteRunResponse(w, false, "Requête invalide: "+err.Error())
		return
	}
	if Trim(req.Code) == "" {
		WriteRunResponse(w, false, "Aucun code fourni.\nIndice: écris une première version de la fonction attendue puis relance les tests.")
		return
	}

	ex := FindExercise(exercises, req.ExerciseID)
	if ex != nil {
		ok, out := runExercise(r.Context(), *ex, req.Code)
		WriteRunResponse(w, ok, out)
		return
	}

	jsEx := FindExercise(jsExercises, req.ExerciseID)
	if jsEx != nil {
		ok, out := runJSExercise(r.Context(), *jsEx, req.Code)
		WriteRunResponse(w, ok, out)
		return
	}

	rustEx := FindExercise(rustExercises, req.ExerciseID)
	if rustEx != nil {
		ok, out := runRustExercise(r.Context(), *rustEx, req.Code)
		WriteRunResponse(w, ok, out)
		return
	}

	javaEx := FindExercise(javaExercises, req.ExerciseID)
	if javaEx == nil {
		WriteRunResponse(w, false, "Exercice inconnu: "+req.ExerciseID)
		return
	}
	ok, out := runJavaExercise(r.Context(), *javaEx, req.Code)
	WriteRunResponse(w, ok, out)
}

func handleStatic(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/")
	for _, part := range strings.Split(path, "/") {
		if strings.HasPrefix(part, ".") {
			http.NotFound(w, r)
			return
		}
	}
	allowed := path == "index.html" || path == "app.js" || path == "version.js" || path == "style.css" || path == "blank.css"
	if strings.HasPrefix(path, "learning-content/") {
		allowed = filepath.Ext(path) == ".md" || path == "learning-content/manifest.json"
	}
	if strings.HasPrefix(path, "Js_exam_instructions/") || strings.HasPrefix(path, "js_exam_instructions/") {
		allowed = filepath.Ext(path) == ".md"
	}
	first := strings.SplitN(path, "/", 2)[0]
	privateDir := first != "" && DirExists(filepath.Join(rootDir, first))
	if path == "" || (!strings.Contains(path, ".") && !privateDir && !FileExists(filepath.Join(rootDir, path))) {
		path = "index.html"
		allowed = true
	}
	if !allowed {
		http.NotFound(w, r)
		return
	}
	target := filepath.Join(rootDir, path)
	resolved, err := filepath.EvalSymlinks(target)
	root, rootErr := filepath.EvalSymlinks(rootDir)
	if rootErr == nil && resolved != filepath.Join(root, path) {
		http.NotFound(w, r)
		return
	}
	if err != nil || rootErr != nil || !strings.HasPrefix(resolved, root+string(filepath.Separator)) || !FileExists(resolved) {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, resolved)
}

type runGate struct {
	admitted, active chan struct{}
	wait             time.Duration
}

func positiveEnv(name string, fallback int) int {
	n, err := strconv.Atoi(os.Getenv(name))
	if err != nil || n <= 0 || n > 1000 {
		return fallback
	}
	return n
}
func newRunGate() *runGate {
	active := positiveEnv("RUNNER_MAX_ACTIVE", 3)
	queue := positiveEnv("RUNNER_MAX_QUEUE", 6)
	return &runGate{make(chan struct{}, active+queue), make(chan struct{}, active), time.Duration(positiveEnv("RUNNER_QUEUE_WAIT_SECONDS", 15)) * time.Second}
}
func (g *runGate) wrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			next.ServeHTTP(w, r)
			return
		}
		select {
		case g.admitted <- struct{}{}:
		default:
			WriteRunResponse(w, false, "Serveur occupé, réessayez plus tard.")
			return
		}
		timer := time.NewTimer(g.wait)
		defer timer.Stop()
		select {
		case g.active <- struct{}{}:
		case <-timer.C:
			<-g.admitted
			WriteRunResponse(w, false, "Serveur occupé, réessayez plus tard.")
			return
		case <-r.Context().Done():
			<-g.admitted
			return
		}
		// The worker owns both slots until Docker cleanup completes, even when the
		// caller has timed out. It never writes to the real response after return.
		ctx, cancel := context.WithTimeout(r.Context(), runTimeout())
		defer cancel()
		done := make(chan *httptest.ResponseRecorder, 1)
		go func() {
			response := httptest.NewRecorder()
			defer func() {
				if recover() != nil {
					response = httptest.NewRecorder()
					WriteRunResponse(response, false, "Erreur système pendant l'exécution.")
				}
				<-g.active
				<-g.admitted
				done <- response
			}()
			next.ServeHTTP(response, r.WithContext(ctx))
		}()
		select {
		case response := <-done:
			for key, values := range response.Header() {
				for _, value := range values {
					w.Header().Add(key, value)
				}
			}
			w.WriteHeader(response.Code)
			_, _ = w.Write(response.Body.Bytes())
		case <-ctx.Done():
			if r.Context().Err() == nil {
				WriteRunResponse(w, false, "Temps limite dépassé.")
			}
		}
	})
}

func resolveJSInstructionsDir(root string) string {
	for _, candidate := range jsInstructionsDirCandidates {
		p := filepath.Join(root, candidate)
		if DirExists(p) {
			return p
		}
	}
	return ""
}

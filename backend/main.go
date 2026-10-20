package backend

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"strings"
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
		mux.HandleFunc("/api/run", handleRun)
		mux.HandleFunc("/", handleStatic)
	case serviceModeCatalog:
		mux.HandleFunc("/api/exercises", handleExercises)
		mux.HandleFunc("/internal/runner-catalog", handleRunnerCatalog)
	case serviceModeRunner:
		mux.HandleFunc("/api/run", handleRun)
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
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteRunResponse(w, false, "Requête invalide: "+err.Error())
		return
	}
	if Trim(req.Code) == "" {
		WriteRunResponse(w, false, "Aucun code fourni.\nIndice: écris une première version de la fonction attendue puis relance les tests.")
		return
	}

	ex := FindExercise(exercises, req.ExerciseID)
	if ex != nil {
		ok, out := RunExercise(*ex, req.Code)
		WriteRunResponse(w, ok, out)
		return
	}

	jsEx := FindExercise(jsExercises, req.ExerciseID)
	if jsEx != nil {
		ok, out := RunJSExercise(*jsEx, req.Code)
		WriteRunResponse(w, ok, out)
		return
	}

	rustEx := FindExercise(rustExercises, req.ExerciseID)
	if rustEx != nil {
		ok, out := RunRustExercise(*rustEx, req.Code)
		WriteRunResponse(w, ok, out)
		return
	}

	javaEx := FindExercise(javaExercises, req.ExerciseID)
	if javaEx == nil {
		WriteRunResponse(w, false, "Exercice inconnu: "+req.ExerciseID)
		return
	}
	ok, out := RunJavaExercise(*javaEx, req.Code)
	WriteRunResponse(w, ok, out)
}

func handleStatic(w http.ResponseWriter, r *http.Request) {
	requested := filepath.Clean(r.URL.Path)
	requested = strings.TrimPrefix(requested, "/")
	if requested == "" {
		requested = "index.html"
	}
	if strings.HasPrefix(requested, "..") {
		http.NotFound(w, r)
		return
	}

	target := filepath.Join(rootDir, requested)
	if !FileExists(target) {
		target = filepath.Join(rootDir, "index.html")
	}
	http.ServeFile(w, r, target)
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

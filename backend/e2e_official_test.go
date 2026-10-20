package backend

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"testing"
)

// Tests de bout en bout contre les vraies moulinettes officielles (Docker et
// catalogue Zone01). Longs : lancés seulement avec RUN_OFFICIAL_E2E=1.
//
//	RUN_OFFICIAL_E2E=1 go test -run TestOfficialE2E -timeout 2h -v ./...

func requireOfficialE2E(t *testing.T) {
	t.Helper()
	if os.Getenv("RUN_OFFICIAL_E2E") != "1" {
		t.Skip("set RUN_OFFICIAL_E2E=1 to run every exercise against the official images")
	}
	withTemporaryRunnerRoot(t)
	// Des centaines de conteneurs d'affilée : la limite de 10 s faite pour un
	// élève seul donnerait de faux échecs sur une machine chargée.
	if os.Getenv("RUNNER_TIMEOUT_SECONDS") == "" {
		t.Setenv("RUNNER_TIMEOUT_SECONDS", "180")
	}
}

// extractSolutions copie le dossier des solutions officielles d'une image.
func extractSolutions(t *testing.T, image, dir string) string {
	t.Helper()
	out := t.TempDir()
	cmd := exec.Command("sh", "-c", fmt.Sprintf(
		"docker run --rm --network none --entrypoint tar %s -C %s -cf - solutions | tar -xf - -C %s", image, dir, out))
	if b, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("extraction des solutions de %s : %v\n%s", image, err, b)
	}
	dir = filepath.Join(out, "solutions")
	if entries, err := os.ReadDir(dir); err != nil || len(entries) == 0 {
		t.Fatalf("aucune solution officielle dans %s", image)
	}
	return dir
}

// readSolution lit la solution officielle d'un exercice parmi les chemins
// candidats.
func readSolution(root string, candidates ...string) (string, bool) {
	for _, c := range candidates {
		if b, err := os.ReadFile(filepath.Join(root, c)); err == nil {
			return string(b), true
		}
	}
	return "", false
}

type e2eResult struct {
	id, out string
	ok      bool
	skipped string
}

// runAll lance les exercices en parallèle (4 à la fois) et renvoie les
// résultats triés.
func runAll(list []Exercise, run func(Exercise) e2eResult) []e2eResult {
	results := make([]e2eResult, len(list))
	sem := make(chan struct{}, 4)
	var wg sync.WaitGroup
	for i, ex := range list {
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			results[i] = run(ex)
		}()
	}
	wg.Wait()
	sort.Slice(results, func(i, j int) bool { return results[i].id < results[j].id })
	return results
}

func reportE2E(t *testing.T, label string, results []e2eResult, wantOK bool) {
	t.Helper()
	passed, skipped := 0, 0
	for _, r := range results {
		switch {
		case r.skipped != "":
			skipped++
			t.Logf("%s : %s ignoré (%s)", label, r.id, r.skipped)
		case r.ok == wantOK:
			passed++
		default:
			t.Errorf("%s : %s — attendu ok=%v\n%s", label, r.id, wantOK, firstLines(r.out, 12))
		}
	}
	t.Logf("%s : %d/%d conformes, %d ignorés", label, passed, len(results)-skipped, skipped)
}

func firstLines(s string, n int) string {
	lines := strings.Split(strings.TrimSpace(s), "\n")
	if len(lines) > n {
		lines = append(lines[:n], "…")
	}
	return strings.Join(lines, "\n")
}

// harnessError repère une erreur du correcteur lui-même (fichier mal placé,
// Docker) plutôt qu'un échec de l'élève.
func harnessError(out string) bool {
	for _, marker := range []string{"No such file", "cannot stat", "can't stat", "Erreur système", "Erreur de préparation", "Unable to find image", "docker:", "Temps limite"} {
		if strings.Contains(out, marker) {
			return true
		}
	}
	return false
}

func goExercisesForE2E(t *testing.T) []Exercise {
	t.Helper()
	list, err := LoadGoExercises()
	if err != nil {
		t.Fatalf("LoadGoExercises : %v", err)
	}
	return list
}

// Solutions officielles refusées par leur propre image (vérifié en lançant
// gofumpt de l'image sur le fichier d'origine) : un échec est attendu, pas
// une erreur du correcteur.
var officialGoSolutionDefects = map[string]string{
	"countrepeats":      "solution officielle non formatée selon gofumpt",
	"digitlen":          "solution officielle non formatée selon gofumpt",
	"retainfirsthalf":   "solution officielle non formatée selon gofumpt",
	"thirdtimeisacharm": "solution officielle non formatée selon gofumpt",
	"romannumbers":      "solution officielle avec une fonction print, refusée par la règle des builtins",
}

func TestOfficialE2EGoSolutionsPass(t *testing.T) {
	requireOfficialE2E(t)
	t.Setenv("RUNNER_GO_DOCKER_IMAGE", "")
	list := goExercisesForE2E(t)
	{
		solutions := extractSolutions(t, officialGoModuleImage, "/test-go")
		results := runAll(list, func(ex Exercise) e2eResult {
			code, ok := readSolution(solutions, ex.Runner+"/main.go", ex.Runner+".go")
			if !ok {
				return e2eResult{id: ex.ID, skipped: "pas de solution officielle dans l'image"}
			}
			pass, out := RunExercise(ex, code)
			if reason, known := officialGoSolutionDefects[ex.Runner]; known && !pass && !harnessError(out) {
				return e2eResult{id: ex.ID, skipped: reason}
			}
			return e2eResult{id: ex.ID, ok: pass, out: out}
		})
		reportE2E(t, "Go (module-go)", results, true)
	}
}

// L'image Rust n'embarque pas de solutions : deux solutions écrites à la
// main.
var rustE2ESolutions = map[string]string{
	"nextprime": `pub fn next_prime(nbr: u64) -> u64 {
    let mut n = nbr.max(2);
    loop {
        if (2..).take_while(|d| d * d <= n).all(|d| n % d != 0) {
            return n;
        }
        n += 1;
    }
}
`,
	"reverse_it": `pub fn reverse_it(v: i64) -> String {
    let digits = v.unsigned_abs().to_string();
    let reversed: String = digits.chars().rev().collect();
    let sign = if v < 0 { "-" } else { "" };
    format!("{}{}{}", sign, reversed, digits)
}
`,
}

func TestOfficialE2ERustSolutionsPass(t *testing.T) {
	requireOfficialE2E(t)
	list, err := LoadRustExercises()
	if err != nil {
		t.Fatalf("LoadRustExercises : %v", err)
	}
	var selected []Exercise
	for _, ex := range list {
		if _, ok := rustE2ESolutions[ex.Runner]; ok {
			selected = append(selected, ex)
		}
	}
	if len(selected) != len(rustE2ESolutions) {
		t.Fatalf("exercices Rust trouvés : %d, attendu %d", len(selected), len(rustE2ESolutions))
	}
	results := runAll(selected, func(ex Exercise) e2eResult {
		ok, out := RunRustExercise(ex, rustE2ESolutions[ex.Runner])
		return e2eResult{id: ex.ID, ok: ok, out: out}
	})
	reportE2E(t, "Rust (solutions écrites à la main)", results, true)
}

// Un code incomplet doit échouer sur une vraie erreur de compilation ou de
// test, jamais sur une erreur du correcteur : chaque exercice reçoit son code
// là où sa moulinette l'attend.
func TestOfficialE2ETemplatesFailCleanly(t *testing.T) {
	requireOfficialE2E(t)
	t.Setenv("RUNNER_GO_DOCKER_IMAGE", "")
	golang := goExercisesForE2E(t)
	rust, err := LoadRustExercises()
	if err != nil {
		t.Fatalf("LoadRustExercises : %v", err)
	}
	java, err := LoadJavaExercises()
	if err != nil {
		t.Fatalf("LoadJavaExercises : %v", err)
	}
	previousJS := jsInstructionsDir
	jsInstructionsDir = resolveJSInstructionsDir("..")
	t.Cleanup(func() { jsInstructionsDir = previousJS })
	js, err := LoadJSExercises(jsInstructionsDir)
	if err != nil {
		t.Fatalf("LoadJSExercises : %v", err)
	}
	previousRoot := rootDir
	jsRoot, _ := filepath.Abs("..")
	for _, set := range []struct {
		label string
		list  []Exercise
		run   func(Exercise, string) (bool, string)
	}{
		{"Go", golang, RunExercise},
		{"Rust", rust, RunRustExercise},
		{"Java", java, RunJavaExercise},
		{"JS", js, func(ex Exercise, code string) (bool, string) {
			// Le correcteur JS lit ses tests dans Js_exam_test, à la racine.
			rootDir = jsRoot
			defer func() { rootDir = previousRoot }()
			return RunJSExercise(ex, code)
		}},
	} {
		if set.label == "JS" {
			// Les exercices JS partagent la racine : un à la fois.
			var results []e2eResult
			for _, ex := range set.list {
				ok, out := set.run(ex, ex.Template)
				r := e2eResult{id: ex.ID, ok: ok, out: out}
				if harnessError(out) {
					r.ok = true // signale l'erreur du correcteur
				}
				results = append(results, r)
			}
			reportE2E(t, set.label+" (modèle)", results, false)
			continue
		}
		results := runAll(set.list, func(ex Exercise) e2eResult {
			ok, out := set.run(ex, ex.Template)
			if harnessError(out) {
				ok = true // compté comme non conforme : erreur du correcteur
			}
			return e2eResult{id: ex.ID, ok: ok, out: out}
		})
		reportE2E(t, set.label+" (modèle)", results, false)
	}
}

// L'image Java n'embarque pas de solutions : quelques solutions écrites à la
// main couvrent un fichier unique, une classe au nom différent de
// l'exercice et un rendu sur plusieurs fichiers.
var javaE2ESolutions = map[string]string{
	"goodbye-mars": `public class GoodbyeMars {
    public static String goodbyeMars() {
        return "Goodbye Mars !";
    }
}
`,
	"check-anagram": `import java.util.Arrays;

public class AnagramChecker {
    public boolean isAnagram(String a, String b) {
        char[] x = a.toLowerCase().toCharArray();
        char[] y = b.toLowerCase().toCharArray();
        Arrays.sort(x);
        Arrays.sort(y);
        return Arrays.equals(x, y);
    }
}
`,
	"todo-list": `public class Task {
    private String description;
    private TaskStatus status = TaskStatus.NEW;

    public Task(String description) { this.description = description; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public TaskStatus getStatus() { return status; }
    public void setStatus(TaskStatus status) { this.status = status; }
}

enum TaskStatus { NEW, IN_PROGRESS, COMPLETED }

public class TodoList {
    private Task[] tasks;
    private int capacity;
    private int size;

    public TodoList(int capacity) {
        this.capacity = capacity;
        this.tasks = new Task[capacity];
    }

    public void addTask(String description) {
        if (size < capacity) {
            tasks[size++] = new Task(description);
        }
    }

    public void setStatus(int index, TaskStatus status) {
        if (index >= 0 && index < size) {
            tasks[index].setStatus(status);
        }
    }

    public void setDescription(int index, String description) {
        if (index >= 0 && index < size) {
            tasks[index].setDescription(description);
        }
    }

    public void displayTasks() {
        System.out.print(toString());
    }

    @Override
    public String toString() {
        StringBuilder sb = new StringBuilder("Tasks:\n");
        for (int i = 0; i < size; i++) {
            sb.append(String.format("%-34s| %s\n", tasks[i].getDescription(), tasks[i].getStatus()));
        }
        return sb.toString();
    }
}
`,
}

func TestOfficialE2EJavaSolutionsPass(t *testing.T) {
	requireOfficialE2E(t)
	list, err := LoadJavaExercises()
	if err != nil {
		t.Fatalf("LoadJavaExercises : %v", err)
	}
	var selected []Exercise
	for _, ex := range list {
		if _, ok := javaE2ESolutions[strings.TrimPrefix(ex.ID, "java-")]; ok {
			selected = append(selected, ex)
		}
	}
	if len(selected) != len(javaE2ESolutions) {
		t.Fatalf("exercices Java trouvés : %d, attendu %d", len(selected), len(javaE2ESolutions))
	}
	results := runAll(selected, func(ex Exercise) e2eResult {
		ok, out := RunJavaExercise(ex, javaE2ESolutions[strings.TrimPrefix(ex.ID, "java-")])
		return e2eResult{id: ex.ID, ok: ok, out: out}
	})
	reportE2E(t, "Java (solutions écrites à la main)", results, true)
}

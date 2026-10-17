package backend

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// Moulinettes Rust : module-rust pour le cursus actuel (CDA), test-rust
// pour l'ancien cursus div-01, conservé en archive.
var (
	officialRustExamImage       = officialImage("test-rust")
	officialRustCheckpointImage = officialImage("module-rust")
)

type zoneRustNode struct {
	Name     string                  `json:"name"`
	Type     string                  `json:"type"`
	Key      string                  `json:"key"`
	Path     string                  `json:"path"`
	Attrs    zoneRustAttrs           `json:"attrs"`
	Children map[string]zoneRustNode `json:"children"`
}

type zoneRustAttrs struct {
	Subject       string   `json:"subject"`
	ExpectedFiles []string `json:"expectedFiles"`
	Validations   []struct {
		Type      string `json:"type"`
		TestImage string `json:"testImage"`
	} `json:"validations"`
	CodeEditor struct {
		ProvidedFiles []struct {
			EditorPath string `json:"editorPath"`
		} `json:"providedFiles"`
	} `json:"codeEditor"`
}

// rustExams : le checkpoint final CDA réunit les exercices des checkpoints
// précédents ; l'examen final div-01 reste disponible en archive.
var rustExams = []zoneExam{
	{path: "/rouen/cursus-cda/piscine-rust/final-checkpoint-rust", label: "Checkpoint · ", image: "ghcr.io/01-edu/module-rust"},
	{path: "/rouen/div-01/piscine-rust/final-exam-rust", label: archiveLabel + "Exam final · ", archive: true, image: "ghcr.io/01-edu/test-rust"},
}

// LoadRustExercises charge les exercices Rust du catalogue Zone01.
func LoadRustExercises() ([]Exercise, error) {
	ctx, cancel := context.WithTimeout(context.Background(), runTimeout())
	defer cancel()
	root, err := zoneCatalog(ctx)
	if err != nil {
		return nil, err
	}
	var list []Exercise
	for _, found := range collectZoneExercises(root, rustExams) {
		child := found.node
		prefix := "checkpoint"
		if found.exam.archive {
			prefix = "exam"
		}
		// The official Rust test images import every submitted exercise as a
		// crate.  Some legacy editor metadata still mentions main.rs, but
		// placing such a submission there makes the official tests unable to
		// import it.  Keep the runner's actual contract: src/lib.rs.
		file := "src/lib.rs"
		runner := child.Name
		if runner == "" {
			runner = strings.ReplaceAll(child.Key, "-", "_")
		}
		list = append(list, Exercise{ID: "rust-" + prefix + "-" + child.Key, Title: found.exam.label + child.Name, Runner: runner, Template: rustTemplate(file), Statement: rustStatementPlaceholder(child.Attrs.Subject), ExpectedFiles: []string{file}, Image: found.image, SubjectURL: child.Attrs.Subject, Archive: found.exam.archive})
	}
	sortExercises(list)
	hydrateZoneStatements(ctx, list)
	return list, nil
}

func fetchZoneStatement(ctx context.Context, subject string) (string, error) {
	path := strings.TrimSpace(subject)
	if strings.HasPrefix(path, "/markdown/") {
		path = "/api/content/" + strings.TrimPrefix(path, "/markdown/")
	}
	if !strings.HasPrefix(path, "/api/content/") {
		return "", fmt.Errorf("url d'énoncé Rust invalide")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://zone01normandie.org"+path, nil)
	if err != nil {
		return "", err
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("énoncé Rust: HTTP %d", res.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(body)), nil
}

func rustTemplate(file string) string {
	if strings.HasSuffix(file, "main.rs") {
		return "fn main() {\n    // Écris ta solution ici.\n}\n"
	}
	return "// Écris ta solution ici.\n"
}

func rustStatementPlaceholder(subject string) string {
	if subject == "" {
		return "## Énoncé Rust\n\nÉnoncé officiel indisponible."
	}
	return "## Énoncé Rust\n\nL’énoncé officiel est chargé avec le catalogue Zone01 : `" + subject + "`."
}

func RunRustExercise(ex Exercise, code string) (bool, string) {
	dir, err := os.MkdirTemp(rootDir, "rustexam-*")
	if err != nil {
		return false, "Erreur système: " + err.Error()
	}
	defer os.RemoveAll(dir)
	_ = os.Chmod(dir, 0o777)
	if err := prepareRustStudentDir(dir, ex, code); err != nil {
		return false, "Erreur de préparation Rust: " + err.Error()
	}
	ctx, cancel := context.WithTimeout(context.Background(), runTimeout())
	defer cancel()
	image := pinnedImage(ex.Image)
	if image == "" {
		image = officialRustCheckpointImage
	}
	args := append([]string{"run", "--rm", "--platform", "linux/amd64"}, baseDockerRunArgs("")...)
	args = withOptionalCPULimit(args)
	// test-rust copies ./student to ./solutions from its working directory.
	// Mount the temporary workspace as that student folder, rather than over
	// the image's own /app directory (which also contains the official tests).
	args = append(args, "-w", "/app/student", "-v", dir+":/app/student/student:rw", "-e", "EXERCISE="+ex.Runner, image)
	cmd := exec.CommandContext(ctx, "docker", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	err = cmd.Run()
	out := strings.TrimSpace(stdout.String() + "\n" + stderr.String())
	if ctx.Err() == context.DeadlineExceeded {
		return false, "Temps limite dépassé."
	}
	if err != nil {
		if out == "" {
			out = "Échec moulinette Rust officielle: " + err.Error()
		}
		return false, out
	}
	if out == "" {
		out = "OK: tous les tests Rust sont validés."
	}
	return true, out
}

func prepareRustStudentDir(dir string, ex Exercise, code string) error {
	name := strings.ReplaceAll(ex.Runner, "-", "_")
	project := filepath.Join(dir, ex.Runner)
	file := "src/lib.rs"
	if len(ex.ExpectedFiles) > 0 {
		file = ex.ExpectedFiles[0]
	}
	if err := os.MkdirAll(filepath.Join(project, filepath.Dir(file)), 0o755); err != nil {
		return err
	}
	manifest := "[package]\nname = \"" + name + "\"\nversion = \"0.1.0\"\nedition = \"2024\"\n"
	if err := os.WriteFile(filepath.Join(project, "Cargo.toml"), []byte(manifest), 0o644); err != nil {
		return err
	}
	if !strings.HasSuffix(code, "\n") {
		code += "\n"
	}
	return os.WriteFile(filepath.Join(project, file), []byte(code), 0o644)
}

package backend

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

type Exercise struct {
	ID            string   `json:"id"`
	Title         string   `json:"title"`
	Statement     string   `json:"statement"`
	Example       string   `json:"example"`
	Template      string   `json:"template"`
	Runner        string   `json:"runner"`
	ExpectedFiles []string `json:"expectedFiles,omitempty"`
	// Archive : examen de l'ancien cursus (div-01), conservé et consultable
	// mais jamais tiré dans un True Exam.
	Archive    bool   `json:"archive,omitempty"`
	Image      string `json:"-"`
	SubjectURL string `json:"-"`
}

type RunRequest struct {
	ExerciseID string `json:"exerciseId"`
	Code       string `json:"code"`
}

type RunResponse struct {
	Success bool   `json:"success"`
	Output  string `json:"output"`
}

// RunnerCatalog is the private, immutable snapshot consumed by the Runner.
// It contains the image metadata intentionally omitted from the browser API.
type RunnerCatalog struct {
	Go   []RunnerExercise `json:"go"`
	JS   []RunnerExercise `json:"js"`
	Rust []RunnerExercise `json:"rust"`
	Java []RunnerExercise `json:"java"`
}

type RunnerExercise struct {
	Exercise
	Image      string `json:"image"`
	SubjectURL string `json:"subjectURL"`
}

func runnerExercises(list []Exercise) []RunnerExercise {
	result := make([]RunnerExercise, len(list))
	for i, exercise := range list {
		result[i] = RunnerExercise{Exercise: exercise, Image: exercise.Image, SubjectURL: exercise.SubjectURL}
	}
	return result
}

func catalogExercises(list []RunnerExercise) []Exercise {
	result := make([]Exercise, len(list))
	for i, exercise := range list {
		result[i] = exercise.Exercise
		result[i].Image = exercise.Image
		result[i].SubjectURL = exercise.SubjectURL
	}
	return result
}

// Vérifie la structure nécessaire à l'affichage des exercices Go.
// Les tests ne sont volontairement plus lus depuis le dépôt : ils sont
// embarqués dans l'image officielle de l'école.
func CheckBackendLayout() error {
	if !DirExists(instructionsDir) {
		return fmt.Errorf("%s introuvable", instructionsDirName)
	}
	return nil
}

// Charge les exercices Go depuis exam-instructions. Le runner est l'identifiant
// officiel de l'exercice, résolu dans l'image ghcr.io/01-edu/test-go.
func LoadExercises() ([]Exercise, error) {
	entries, err := os.ReadDir(instructionsDir)
	if err != nil {
		return nil, err
	}

	var list []Exercise

	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		id := e.Name()

		readmePath := filepath.Join(instructionsDir, id, "README.md")
		if !FileExists(readmePath) {
			continue
		}
		body, err := os.ReadFile(readmePath)
		if err != nil {
			return nil, fmt.Errorf("lecture README %s: %w", id, err)
		}

		template := "package piscine\n\n// Implémente " + id + " comme décrit dans l'énoncé.\n"

		list = append(list, Exercise{
			ID:        id,
			Title:     id,
			Statement: string(body),
			Example:   "",
			Template:  template,
			Runner:    id,
		})
	}

	sort.Slice(list, func(i, j int) bool { return list[i].ID < list[j].ID })
	return list, nil
}

// Charge les exercices JS depuis js_exam_instructions (fichiers .md).
func LoadJSExercises(jsDir string) ([]Exercise, error) {
	if strings.TrimSpace(jsDir) == "" || !DirExists(jsDir) {
		return []Exercise{}, nil
	}

	entries, err := os.ReadDir(jsDir)
	if err != nil {
		return nil, err
	}

	var list []Exercise
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if !strings.EqualFold(filepath.Ext(name), ".md") {
			continue
		}
		base := strings.TrimSpace(strings.TrimSuffix(name, filepath.Ext(name)))
		if strings.EqualFold(base, "README") {
			continue
		}

		fullPath := filepath.Join(jsDir, name)
		body, err := os.ReadFile(fullPath)
		if err != nil {
			return nil, fmt.Errorf("lecture markdown JS %s: %w", name, err)
		}
		id := normalizeExerciseFileName(base)
		if id == "" {
			continue
		}

		testID := jsTestIDForSubject(id)
		expectedFile := "js-" + testID + ".js"
		template := "function solve(input) {\n  return input;\n}\n\nmodule.exports = { solve };\n"
		list = append(list, Exercise{
			ID:            id,
			Title:         base,
			Statement:     string(body),
			Example:       "",
			Template:      template,
			Runner:        testID,
			ExpectedFiles: []string{expectedFile},
		})
	}

	sort.Slice(list, func(i, j int) bool { return strings.ToLower(list[i].Title) < strings.ToLower(list[j].Title) })
	return list, nil
}

func jsTestIDForSubject(subjectID string) string {
	switch subjectID {
	case "array-reverse-chunks":
		return "array-chunk-reversal"
	case "grid-words-finder":
		return "grid-word-finder"
	case "grid-words-finder-2":
		return "grid-word-finder2"
	case "snake-path-validator":
		return "snakepath-validator"
	case "divisorfinder":
		return "divisor-finder"
	case "evensum":
		return "even-sum"
	case "perfectnum":
		return "perfect-num"
	case "sentencepyramid":
		return "sentence-pyramid"
	default:
		return subjectID
	}
}

func normalizeExerciseFileName(input string) string {
	v := strings.ToLower(strings.TrimSpace(input))
	v = strings.ReplaceAll(v, "_", "-")
	v = strings.ReplaceAll(v, " ", "-")
	re := regexp.MustCompile(`[^a-z0-9-]+`)
	v = re.ReplaceAllString(v, "")
	v = strings.Trim(v, "-")
	if v == "" {
		return ""
	}
	multiDash := regexp.MustCompile(`-+`)
	return multiDash.ReplaceAllString(v, "-")
}

func FindExercise(list []Exercise, id string) *Exercise {
	for i := range list {
		if list[i].ID == id {
			return &list[i]
		}
	}
	return nil
}

// JSON helper
func WriteRunResponse(w http.ResponseWriter, ok bool, out string) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(RunResponse{
		Success: ok,
		Output:  out,
	})
}

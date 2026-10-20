package backend

import (
	"bytes"
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// Moulinette Java du cursus CDA.
var officialJavaModuleImage = officialImage("module-java")

// javaExams : les trois checkpoints Java du CDA. Zone01 ne publie pas
// d'examen final Java.
var javaExams = []zoneExam{
	{path: "/rouen/cursus-cda/piscine-java/checkpoint-01-java", image: "ghcr.io/01-edu/module-java"},
	{path: "/rouen/cursus-cda/piscine-java/checkpoint-02-java", image: "ghcr.io/01-edu/module-java"},
	{path: "/rouen/cursus-cda/piscine-java/checkpoint-03-java", image: "ghcr.io/01-edu/module-java"},
}

// LoadJavaExercises charge les checkpoints Java du catalogue Zone01.
func LoadJavaExercises() ([]Exercise, error) {
	ctx, cancel := context.WithTimeout(context.Background(), runTimeout())
	defer cancel()
	root, err := zoneCatalog(ctx)
	if err != nil {
		return nil, err
	}
	var list []Exercise
	for _, found := range collectZoneExercises(root, javaExams) {
		child := found.node
		// Le nom de l'exercice désigne sa moulinette (dossier <Nom>_test) ;
		// les fichiers attendus peuvent porter d'autres noms, parfois plusieurs.
		runner := strings.TrimSpace(child.Name)
		if runner == "" {
			runner = javaClassName(child.Key)
		}
		files := javaExpectedFiles(child.Attrs.ExpectedFiles, runner)
		list = append(list, Exercise{ID: "java-" + child.Key, Title: runner, Runner: runner, Template: javaTemplate(files), Statement: javaStatementPlaceholder(child.Attrs.Subject), ExpectedFiles: files, Image: found.image, SubjectURL: child.Attrs.Subject})
	}
	sortExercises(list)
	hydrateZoneStatements(ctx, list)
	return list, nil
}

// javaExpectedFiles garde les fichiers .java annoncés par le catalogue, ou
// <Nom>.java à défaut.
func javaExpectedFiles(expected []string, runner string) []string {
	var files []string
	for _, f := range expected {
		f = strings.TrimSpace(filepath.Base(f))
		if strings.HasSuffix(f, ".java") {
			files = append(files, f)
		}
	}
	if len(files) == 0 {
		files = []string{runner + ".java"}
	}
	return files
}

// javaTemplate propose une classe par fichier attendu.
func javaTemplate(files []string) string {
	var b strings.Builder
	if len(files) > 1 {
		b.WriteString("// Fichiers attendus : " + strings.Join(files, ", ") + ".\n")
		b.WriteString("// Écris toutes les classes ici : chacune sera placée dans son propre fichier.\n\n")
	}
	for i, f := range files {
		if i > 0 {
			b.WriteString("\n")
		}
		b.WriteString("public class " + strings.TrimSuffix(f, ".java") + " {\n    // Écris ta solution ici.\n}\n")
	}
	return b.String()
}

func javaClassName(key string) string {
	var out strings.Builder
	for _, part := range strings.FieldsFunc(key, func(r rune) bool { return r == '-' || r == '_' }) {
		if part == "" {
			continue
		}
		out.WriteString(strings.ToUpper(part[:1]))
		out.WriteString(part[1:])
	}
	return out.String()
}

func javaStatementPlaceholder(subject string) string {
	if subject == "" {
		return "## Énoncé Java\n\nÉnoncé officiel indisponible."
	}
	return "## Énoncé Java\n\nChargement de l’énoncé officiel Zone01 : `" + subject + "`."
}

func RunJavaExercise(ex Exercise, code string) (bool, string) {
	dir, err := os.MkdirTemp(rootDir, "javaexam-*")
	if err != nil {
		return false, "Erreur système: " + err.Error()
	}
	defer os.RemoveAll(dir)
	_ = os.Chmod(dir, 0o777)
	if err := prepareJavaStudentDir(dir, ex, code); err != nil {
		return false, "Erreur de préparation Java: " + err.Error()
	}
	ctx, cancel := context.WithTimeout(context.Background(), runTimeout())
	defer cancel()
	image := pinnedImage(ex.Image)
	if image == "" {
		image = officialJavaModuleImage
	}
	args := append([]string{"run", "--rm", "--platform", "linux/amd64"}, baseDockerRunArgs("")...)
	args = withOptionalCPULimit(args)
	args = append(args, "-v", dir+":/app/student:rw", "-e", "EXERCISE="+ex.Runner, image)
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
			out = "Échec moulinette Java officielle: " + err.Error()
		}
		return false, out
	}
	if out == "" {
		out = "OK: tous les tests Java sont validés."
	}
	return true, out
}

// prepareJavaStudentDir écrit le code dans student/<Nom>/, un fichier par
// type public, comme Java l'exige : la moulinette compile tous les fichiers
// de ce dossier avec ses tests.
func prepareJavaStudentDir(dir string, ex Exercise, code string) error {
	project := filepath.Join(dir, ex.Runner)
	if err := os.MkdirAll(project, 0o755); err != nil {
		return err
	}
	fallback := ex.Runner + ".java"
	if len(ex.ExpectedFiles) > 0 {
		fallback = ex.ExpectedFiles[0]
	}
	for name, source := range javaSourceFiles(code, fallback) {
		if err := os.WriteFile(filepath.Join(project, name), []byte(source), 0o644); err != nil {
			return err
		}
	}
	return nil
}

package backend

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

func RunJSExercise(ex Exercise, code string) (bool, string) {
	tmpDir, err := os.MkdirTemp(rootDir, "jsexam-*")
	if err != nil {
		return false, "Erreur système tmpDir: " + err.Error()
	}
	defer os.RemoveAll(tmpDir)
	_ = os.Chmod(tmpDir, 0o777)

	fileName := "solution.js"
	if len(ex.ExpectedFiles) > 0 && strings.TrimSpace(ex.ExpectedFiles[0]) != "" {
		fileName = ex.ExpectedFiles[0]
	}
	fileName = filepath.Base(fileName)
	codePath := filepath.Join(tmpDir, fileName)
	if err := os.WriteFile(codePath, []byte(code), 0o644); err != nil {
		return false, "Erreur écriture code JS: " + err.Error()
	}
	_ = os.Chmod(codePath, 0o666)

	exerciseName := strings.TrimSpace(ex.Runner)
	if exerciseName == "" {
		exerciseName = ex.ID
	}
	if !strings.HasPrefix(exerciseName, "js-") {
		exerciseName = "js-" + exerciseName
	}
	stdout, stderr, runErr := RunJSDocker(tmpDir, exerciseName, fileName)
	out := strings.TrimSpace(stdout + stderr)
	out = normalizeJSStudentOutput(out)
	out = remapJSStudentReference(out, exerciseName)
	if strings.Contains(out, "SyntaxError") && !strings.Contains(out, "Ligne élève:") {
		if syntaxRef := syntaxLocationFromDockerCheck(tmpDir, fileName); syntaxRef != "" {
			out = strings.TrimSpace(out + "\n" + syntaxRef)
		}
	}

	if runErr != nil {
		if out == "" {
			return false, "Échec test JS: " + runErr.Error()
		}
		return false, out
	}

	if out == "" {
		return true, "OK: tous les tests JS sont validés."
	}
	return true, out
}

func RunJSDocker(studentDir, exerciseID, expectedFiles string) (string, string, error) {
	timeout := runTimeout()
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	image := jsRunnerImage()
	cmdArgs := []string{
		"run", "--rm",
	}
	cmdArgs = append(cmdArgs, baseDockerRunArgs("")...)
	if v := strings.TrimSpace(os.Getenv("RUNNER_CPUS")); v != "" && v != "0" {
		cmdArgs = append(cmdArgs, "--cpus", v)
	}

	cmdArgs = append(cmdArgs,
		"-v", studentDir+":/jail/student:rw",
		"-e", "EXERCISE="+exerciseID,
	)
	if strings.TrimSpace(expectedFiles) != "" {
		cmdArgs = append(cmdArgs, "-e", "FILE="+expectedFiles)
	}
	cmdArgs = append(cmdArgs, image)

	cmd := exec.CommandContext(ctx, "docker", cmdArgs...)
	var outBuf, errBuf bytes.Buffer
	cmd.Stdout = &outBuf
	cmd.Stderr = &errBuf
	err := cmd.Run()

	if ctx.Err() == context.DeadlineExceeded {
		return outBuf.String(), errBuf.String(), context.DeadlineExceeded
	}
	return outBuf.String(), errBuf.String(), err
}

func normalizeJSStudentOutput(out string) string {
	text := strings.TrimSpace(out)
	if text == "" {
		return text
	}
	if strings.EqualFold(text, "Aucun code fourni.") {
		return "Aucun code fourni.\nIndice: commence par écrire une première version de la fonction attendue."
	}

	lines := strings.Split(text, "\n")
	for i := range lines {
		lines[i] = strings.TrimSpace(lines[i])
	}

	testRe := regexp.MustCompile(`(?i)^test #\d+ failed:?$`)
	errRe := regexp.MustCompile(`(?i)(assertionerror|referenceerror|typeerror|syntaxerror|error:)`)
	studentLineRe := regexp.MustCompile(`(?:^|[(/ ])(?:file://)?(?:/jail/student/)?([a-z0-9._-]+\.js):(\d+)(?::(\d+))?`)

	testLabel := ""
	errorLabel := ""
	secondaryError := ""
	studentRef := ""

	for _, line := range lines {
		if line == "" {
			continue
		}
		if testLabel == "" && testRe.MatchString(line) {
			testLabel = line
			continue
		}
		if errRe.MatchString(line) {
			if errorLabel == "" {
				errorLabel = line
			} else if secondaryError == "" && line != errorLabel {
				secondaryError = line
			}
		}
		if studentRef == "" {
			if m := studentLineRe.FindStringSubmatch(line); len(m) >= 3 {
				studentRef = fmt.Sprintf("Ligne élève: %s:%s", m[1], m[2])
			}
		}
	}

	// Already concise success line.
	if strings.Contains(text, "passed (") && !strings.Contains(strings.ToLower(text), "failed") {
		return text
	}

	parts := make([]string, 0, 4)
	if testLabel != "" {
		parts = append(parts, testLabel)
	}
	if errorLabel != "" {
		normalizeErr := func(s string) string {
			v := strings.TrimSpace(s)
			for strings.HasPrefix(v, "Error: ") {
				v = strings.TrimPrefix(v, "Error: ")
				v = strings.TrimSpace(v)
			}
			return strings.TrimSpace(v)
		}
		primaryNorm := normalizeErr(errorLabel)
		secondaryNorm := normalizeErr(secondaryError)
		if secondaryNorm == primaryNorm {
			secondaryError = ""
		}

		if strings.HasPrefix(errorLabel, "Unable to execute") && secondaryError != "" {
			parts = append(parts, errorLabel)
			parts = append(parts, secondaryError)
		} else {
			parts = append(parts, errorLabel)
			if secondaryError != "" && !strings.EqualFold(secondaryError, errorLabel) {
				parts = append(parts, secondaryError)
			}
		}
	}
	if studentRef != "" {
		parts = append(parts, studentRef)
	}
	if studentRef == "" && (strings.Contains(errorLabel, "SyntaxError") || strings.Contains(secondaryError, "SyntaxError")) {
		parts = append(parts, "Indice: vérifie parenthèses/accolades fermées et la syntaxe de la fonction.")
	}
	if len(parts) > 0 {
		return strings.Join(parts, "\n")
	}

	// Fallback: keep a short diagnostic excerpt.
	maxLines := 4
	short := make([]string, 0, maxLines)
	for _, line := range lines {
		if line == "" {
			continue
		}
		short = append(short, line)
		if len(short) == maxLines {
			break
		}
	}
	return strings.Join(short, "\n")
}

func syntaxLocationFromDockerCheck(studentDir, fileName string) string {
	timeout := runTimeout()
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	image := jsRunnerImage()
	target := "/jail/student/" + filepath.Base(fileName)
	cmdArgs := []string{"run", "--rm", "--entrypoint", "node"}
	cmdArgs = append(cmdArgs, baseDockerRunArgs("")...)
	cmdArgs = append(cmdArgs,
		"-v", studentDir+":/jail/student:rw",
		image,
		"--check", target,
	)

	cmd := exec.CommandContext(ctx, "docker", cmdArgs...)
	var outBuf, errBuf bytes.Buffer
	cmd.Stdout = &outBuf
	cmd.Stderr = &errBuf
	_ = cmd.Run()

	raw := strings.TrimSpace(outBuf.String() + "\n" + errBuf.String())
	if raw == "" {
		return ""
	}

	locRe := regexp.MustCompile(`(?:/jail/student/)?([a-z0-9._-]+\.js):(\d+)(?::(\d+))?`)
	if m := locRe.FindStringSubmatch(raw); len(m) >= 3 {
		return fmt.Sprintf("Ligne élève: %s:%s", m[1], m[2])
	}
	return ""
}

func remapJSStudentReference(out, exerciseName string) string {
	offset := jsInjectLineOffset(exerciseName)
	if offset <= 0 {
		return out
	}

	refRe := regexp.MustCompile(`Ligne élève:\s*([a-z0-9._-]+\.js):(\d+)(?::(\d+))?`)
	return refRe.ReplaceAllStringFunc(out, func(match string) string {
		m := refRe.FindStringSubmatch(match)
		if len(m) < 3 {
			return match
		}
		line, err := strconv.Atoi(m[2])
		if err != nil {
			return match
		}
		adjusted := line - offset
		if adjusted < 1 {
			adjusted = 1
		}
		return fmt.Sprintf("Ligne élève: %s:%d", m[1], adjusted)
	})
}

func jsInjectLineOffset(exerciseName string) int {
	if strings.TrimSpace(exerciseName) == "" {
		return 0
	}
	testBase := strings.TrimSpace(exerciseName)
	if strings.HasPrefix(testBase, "js-") {
		testBase = testBase[3:]
	}

	candidates := []string{
		filepath.Join(rootDir, "Js_exam_test", "js-"+testBase+"_test.js"),
		filepath.Join(rootDir, "Js_exam_test", "js-"+testBase+"_test.mjs"),
	}
	for _, p := range candidates {
		raw, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		parts := strings.Split(string(raw), "// /*/ // ⚡")
		if len(parts) < 2 {
			return 0
		}
		inject := strings.TrimSpace(parts[0])
		if inject == "" {
			return 0
		}
		return len(strings.Split(inject, "\n"))
	}
	return 0
}

// jsRunnerImage : la moulinette JS officielle épinglée, sauf réglage
// RUNNER_JS_DOCKER_IMAGE.
func jsRunnerImage() string {
	return getenvDefault("RUNNER_JS_DOCKER_IMAGE", officialImage("module-js"))
}

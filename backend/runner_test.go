package backend

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPrepareOfficialGoStudentDirBuildsBothOfficialLayouts(t *testing.T) {
	dir := t.TempDir()
	code := "package piscine\n\nfunc IsCapitalized(s string) bool { return s != \"\" }"

	if err := prepareOfficialGoStudentDir(dir, "iscapitalized", code); err != nil {
		t.Fatalf("prepareOfficialGoStudentDir: %v", err)
	}

	module, err := os.ReadFile(filepath.Join(dir, "go.mod"))
	if err != nil {
		t.Fatalf("read go.mod: %v", err)
	}
	if !strings.Contains(string(module), "module student") || !strings.Contains(string(module), "github.com/01-edu/z01 v0.1.0") {
		t.Fatalf("go.mod incompatible with the official image: %s", module)
	}

	functionSource, err := os.ReadFile(filepath.Join(dir, "student.go"))
	if err != nil {
		t.Fatalf("read function source: %v", err)
	}
	if !strings.HasPrefix(string(functionSource), "package student\n") {
		t.Fatalf("function source package = %q", functionSource)
	}
	if !strings.HasSuffix(string(functionSource), "\n") {
		t.Fatalf("function source must have a trailing newline: %q", functionSource)
	}

	programSource, err := os.ReadFile(filepath.Join(dir, "iscapitalized", "main.go"))
	if err != nil {
		t.Fatalf("read program source: %v", err)
	}
	if !strings.HasPrefix(string(programSource), "package main\n") {
		t.Fatalf("program source package = %q", programSource)
	}
}

func TestOfficialGoDockerArgsUseTheImageEntrypointContract(t *testing.T) {
	t.Setenv("RUNNER_GO_DOCKER_IMAGE", "")
	t.Setenv("RUNNER_CPUS", "")
	args := officialGoDockerArgs("/tmp/student", "nested/onlya")
	joined := strings.Join(args, "\x00")

	for _, expected := range []string{
		"--platform\x00linux/amd64",
		"/tmp/student:/go-tests/student:rw",
		"/tmp/student:/root/piscine-go:rw",
		"EXERCISE=onlya",
		officialGoRunnerImage,
	} {
		if !strings.Contains(joined, expected) {
			t.Fatalf("docker args do not contain %q: %#v", expected, args)
		}
	}
}

func TestRunExerciseReturnsOfficialSuccessMessage(t *testing.T) {
	useFakeDocker(t, "exit 0")

	ok, out := RunExercise(Exercise{ID: "onlya", Runner: "onlya"}, "package main\n\nfunc main() {}\n")
	if !ok {
		t.Fatalf("RunExercise returned failure: %q", out)
	}
	if got, want := out, "OK: tous les tests sont validés."; got != want {
		t.Fatalf("success message = %q, want %q", got, want)
	}
}

func TestRunExerciseKeepsOfficialFailureDiagnostic(t *testing.T) {
	useFakeDocker(t, "printf '%s\\n' 'Your Go files are not correctly formatted :' >&2\nprintf '%s\\n' 'student.go' >&2\nexit 1")

	ok, out := RunExercise(Exercise{ID: "onlya", Runner: "onlya"}, "package main\n\nfunc main() {}\n")
	if ok {
		t.Fatalf("RunExercise unexpectedly succeeded: %q", out)
	}
	if got, want := out, "Your Go files are not correctly formatted :\nstudent.go"; got != want {
		t.Fatalf("failure diagnostic = %q, want %q", got, want)
	}
}

// This is opt-in because it launches the pinned official image. It proves the
// real Runner boundary rather than the fake Docker contract used by unit tests.
func TestGoRunnerIntegrationWithOfficialImage(t *testing.T) {
	if os.Getenv("RUN_DOCKER_INTEGRATION") != "1" {
		t.Skip("set RUN_DOCKER_INTEGRATION=1 to run the official Docker image")
	}
	previousRoot := rootDir
	rootDir = t.TempDir()
	t.Cleanup(func() { rootDir = previousRoot })

	code := "package main\n\nimport \"fmt\"\n\nfunc main() { fmt.Print(\"a\") }\n"
	ok, out := RunExercise(Exercise{ID: "onlya", Runner: "onlya"}, code)
	if !ok {
		t.Fatalf("official Runner rejected a valid onlya submission: %s", out)
	}
	if out != "OK: tous les tests sont validés." {
		t.Fatalf("official Runner output = %q", out)
	}
}

func TestJSRunnerIntegrationWithOfficialImage(t *testing.T) {
	if os.Getenv("RUN_DOCKER_INTEGRATION") != "1" {
		t.Skip("set RUN_DOCKER_INTEGRATION=1 to run the official Docker image")
	}
	withTemporaryRunnerRoot(t)

	code := "function factorial(n) {\n  let result = 1;\n  for (let i = 2; i <= n; i++) result *= i;\n  return result;\n}\n"
	ok, out := RunJSExercise(Exercise{
		ID:            "factorial",
		Runner:        "factorial",
		ExpectedFiles: []string{"js-factorial.js"},
	}, code)
	if !ok {
		t.Fatalf("official JS Runner rejected a valid factorial submission: %s", out)
	}
}

func TestRustRunnerIntegrationWithOfficialImage(t *testing.T) {
	if os.Getenv("RUN_DOCKER_INTEGRATION") != "1" {
		t.Skip("set RUN_DOCKER_INTEGRATION=1 to run the official Docker image")
	}
	withTemporaryRunnerRoot(t)

	code := "pub fn next_prime(nbr: u64) -> u64 {\n    let mut n = nbr.max(2);\n    while (2..n).take_while(|d| d * d <= n).any(|d| n % d == 0) {\n        n += 1;\n    }\n    n\n}\n"
	ok, out := RunRustExercise(Exercise{
		ID:            "rust-checkpoint-nextprime",
		Runner:        "nextprime",
		Image:         officialRustCheckpointImage,
		ExpectedFiles: []string{"src/lib.rs"},
	}, code)
	if !ok {
		t.Fatalf("official Rust Runner rejected a valid nextprime submission: %s", out)
	}
}

func TestJavaRunnerIntegrationWithOfficialImage(t *testing.T) {
	if os.Getenv("RUN_DOCKER_INTEGRATION") != "1" {
		t.Skip("set RUN_DOCKER_INTEGRATION=1 to run the official Docker image")
	}
	withTemporaryRunnerRoot(t)

	code := "public class GoodbyeMars {\n    public static String goodbyeMars() {\n        return \"Goodbye Mars !\";\n    }\n}\n"
	ok, out := RunJavaExercise(Exercise{
		ID:     "java-goodbye-mars",
		Runner: "GoodbyeMars",
		Image:  officialJavaModuleImage,
	}, code)
	if !ok {
		t.Fatalf("official Java Runner rejected a valid GoodbyeMars submission: %s", out)
	}
}

func withTemporaryRunnerRoot(t *testing.T) {
	t.Helper()
	previousRoot := rootDir
	rootDir = t.TempDir()
	t.Cleanup(func() { rootDir = previousRoot })
}

func TestNormalizeJSStudentOutputStaysGuiding(t *testing.T) {
	raw := "test #2 failed:\nReferenceError: factorial is not defined\n/jail/student/js-factorial.js:12:3"
	got := normalizeJSStudentOutput(raw)
	want := "test #2 failed:\nReferenceError: factorial is not defined\nLigne élève: js-factorial.js:12"
	if got != want {
		t.Fatalf("normalized JS diagnostic = %q, want %q", got, want)
	}
}

func useFakeDocker(t *testing.T, body string) {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "docker")
	script := "#!/bin/sh\nset -eu\n" + body + "\n"
	if err := os.WriteFile(path, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake docker: %v", err)
	}
	t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("RUNNER_GO_DOCKER_IMAGE", "")
}

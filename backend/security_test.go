package backend

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestStaticAllowlist(t *testing.T) {
	old := rootDir
	rootDir = t.TempDir()
	defer func() { rootDir = old }()
	for _, name := range []string{"index.html", "app.js", "backend/main.go", ".git/config", "learning-content/lesson.md", "learning-content/manifest.json", "Js_exam_instructions/test.md", "server"} {
		path := filepath.Join(rootDir, name)
		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(name), 0644); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Symlink(filepath.Join(rootDir, "backend/main.go"), filepath.Join(rootDir, "learning-content/link.md")); err != nil {
		t.Fatal(err)
	}
	for path, status := range map[string]int{"/": 200, "/exam": 200, "/app.js": 200, "/learning-content/lesson.md": 200, "/learning-content/manifest.json": 200, "/Js_exam_instructions/test.md": 200, "/backend": 404, "/backend/main.go": 404, "/.git/config": 404, "/server": 404, "/learning-content/link.md": 404, "/learning-content/missing.md": 404} {
		w := httptest.NewRecorder()
		handleStatic(w, httptest.NewRequest("GET", path, nil))
		if w.Code != status {
			t.Errorf("%s: got %d want %d", path, w.Code, status)
		}
	}
}

func TestGateBoundsAndCancellation(t *testing.T) {
	gate := &runGate{make(chan struct{}, 2), make(chan struct{}, 1), time.Second}
	started := make(chan struct{}, 2)
	release := make(chan struct{})
	handler := gate.wrap(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { started <- struct{}{}; <-release }))
	done := make(chan struct{}, 2)
	go func() {
		handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("POST", "/api/run", nil))
		done <- struct{}{}
	}()
	<-started
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("POST", "/api/run", nil).WithContext(ctx))
		done <- struct{}{}
	}()
	deadline := time.Now().Add(time.Second)
	for len(gate.admitted) != 2 && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if len(gate.admitted) != 2 {
		t.Fatal("request did not queue")
	}
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, httptest.NewRequest("POST", "/api/run", nil))
	var response struct {
		Success bool   `json:"success"`
		Output  string `json:"output"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil || response.Success || !strings.Contains(response.Output, "occupé") {
		t.Fatalf("overload: %s %v", w.Body.String(), err)
	}
	cancel()
	<-done
	close(release)
	<-done
	if len(gate.admitted) != 0 || len(gate.active) != 0 {
		t.Fatal("slots leaked")
	}
}

func TestDockerOutputBoundAndCancellation(t *testing.T) {
	bin := t.TempDir()
	log := filepath.Join(bin, "log")
	script := `#!/bin/sh
case "$1" in
create) echo "$3" > "$LOG"; echo id ;;
start) head -c 2097152 /dev/zero | tr '\000' x; if [ "$HANG" = 1 ]; then exec sleep 30; fi ;;
rm) echo "$3" >> "$LOG" ;;
esac
`
	if err := os.WriteFile(filepath.Join(bin, "docker"), []byte(script), 0755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("LOG", log)
	out, errout, err := runDocker(context.Background(), []string{"run", "--rm", "image"})
	if err != nil || len(out) > 1<<20 || !strings.Contains(errout, "tronquée") {
		t.Fatalf("output: %d %q %v", len(out), errout, err)
	}
	t.Setenv("HANG", "1")
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	_, _, err = runDocker(ctx, []string{"run", "--rm", "image"})
	if err != context.DeadlineExceeded {
		t.Fatalf("cancellation: %v", err)
	}
	data, e := os.ReadFile(log)
	if e != nil {
		t.Fatal(e)
	}
	lines := strings.Fields(string(data))
	if len(lines) != 2 || lines[0] != lines[1] || !strings.HasPrefix(lines[0], "z01exam-") {
		t.Fatalf("container cleanup: %q", data)
	}
}

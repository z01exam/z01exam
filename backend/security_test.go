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
	for path, status := range map[string]int{"/": 200, "/exam": 200, "/session/exam": 200, "/backend/nonexistent": 404, "/app.js": 200, "/learning-content/lesson.md": 200, "/learning-content/manifest.json": 200, "/Js_exam_instructions/test.md": 200, "/backend": 404, "/backend/main.go": 404, "/.git/config": 404, "/server": 404, "/learning-content/link.md": 404, "/learning-content/missing.md": 404} {
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
create) echo "$3" > "$LOG"; if [ "$SLOW_CREATE" = 1 ]; then sleep 0.3; fi; echo id ;;
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
	t.Setenv("HANG", "0")
	t.Setenv("SLOW_CREATE", "1")
	createCtx, createCancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer createCancel()
	_, _, err = runDocker(createCtx, []string{"run", "--rm", "image"})
	if err != context.DeadlineExceeded {
		t.Fatalf("create cancellation: %v", err)
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

func TestWorkspaceRejectsCheckout(t *testing.T) {
	old := rootDir
	rootDir = t.TempDir()
	defer func() { rootDir = old }()
	t.Setenv("RUNNER_WORK_DIR", rootDir)
	if dir, err := makeWorkspace("job-*"); err == nil {
		os.RemoveAll(dir)
		t.Fatal("workspace created in public checkout")
	}
	outside := t.TempDir()
	t.Setenv("RUNNER_WORK_DIR", outside)
	dir, err := makeWorkspace("job-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(dir)
	outside, err = filepath.EvalSymlinks(outside)
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Dir(dir) != outside {
		t.Fatalf("workspace in %s", dir)
	}
}

func TestHTTPTimeoutKeepsSlotUntilDockerCleanup(t *testing.T) {
	for _, scenario := range []string{"blocked-create", "ambiguous-create"} {
		t.Run(scenario, func(t *testing.T) {
			bin := t.TempDir()
			marker := filepath.Join(bin, "allow")
			script := `#!/bin/sh
case "$1" in
create)
  if [ "$SCENARIO" = blocked-create ]; then
    while [ ! -f "$MARKER" ]; do sleep 0.05; done
    echo id; exit 0
  fi
  echo 'connection lost' >&2; exit 1 ;;
rm)
  if [ ! -f "$MARKER" ]; then
    if [ ! -f "$MARKER.attempted" ]; then
      touch "$MARKER.attempted"; echo 'daemon unavailable' >&2; exit 1
    fi
    echo 'No such container' >&2; exit 1
  fi
  exit 0 ;;
start) exit 0 ;;
esac
`
			if err := os.WriteFile(filepath.Join(bin, "docker"), []byte(script), 0755); err != nil {
				t.Fatal(err)
			}
			t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
			t.Setenv("MARKER", marker)
			t.Setenv("SCENARIO", scenario)
			t.Setenv("RUNNER_TIMEOUT_SECONDS", "1")
			gate := &runGate{make(chan struct{}, 1), make(chan struct{}, 1), time.Second}
			handler := gate.wrap(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_, _, err := runDocker(r.Context(), []string{"run", "--rm", "image"})
				WriteRunResponse(w, err == nil, "finished")
			}))
			w := httptest.NewRecorder()
			start := time.Now()
			handler.ServeHTTP(w, httptest.NewRequest("POST", "/api/run", nil))
			if elapsed := time.Since(start); elapsed > 2*time.Second {
				t.Fatalf("HTTP timeout took %s", elapsed)
			}
			if !strings.Contains(w.Body.String(), "Temps limite") {
				t.Fatalf("response: %s", w.Body.String())
			}
			if len(gate.active) != 1 || len(gate.admitted) != 1 {
				t.Fatal("slot released before cleanup")
			}
			busy := httptest.NewRecorder()
			handler.ServeHTTP(busy, httptest.NewRequest("POST", "/api/run", nil))
			if !strings.Contains(busy.Body.String(), "occupé") {
				t.Fatalf("expected backpressure: %s", busy.Body.String())
			}
			if err := os.WriteFile(marker, []byte("ok"), 0600); err != nil {
				t.Fatal(err)
			}
			deadline := time.Now().Add(4 * time.Second)
			for len(gate.admitted) != 0 && time.Now().Before(deadline) {
				time.Sleep(10 * time.Millisecond)
			}
			if len(gate.admitted) != 0 || len(gate.active) != 0 {
				t.Fatal("slot not released after confirmed removal")
			}
		})
	}
}

func TestLifecycleReconcilesDeadOwnersWithoutTouchingLiveJobs(t *testing.T) {
	work := t.TempDir()
	bin := t.TempDir()
	log := filepath.Join(bin, "log")
	fail := filepath.Join(bin, "fail")
	script := `#!/bin/sh
case "$1" in
info) [ ! -f "$FAIL.info" ] ;;
rm) echo "$3" >> "$LOG"; [ ! -f "$FAIL" ] ;;
ps) [ ! -f "$FAIL.ps" ] || cat "$FAIL.ps" ;;
esac
`
	if err := os.WriteFile(filepath.Join(bin, "docker"), []byte(script), 0755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("LOG", log)
	t.Setenv("FAIL", fail)
	first, err := newDockerLifecycle(work)
	if err != nil {
		t.Fatal(err)
	}
	name := "z01exam-" + strings.Repeat("a", 32)
	record, err := first.record(name)
	if err != nil {
		t.Fatal(err)
	}
	second, err := newDockerLifecycle(work)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(record); err != nil {
		t.Fatal("live owner was reconciled")
	}
	if _, err := os.Stat(log); !os.IsNotExist(err) {
		t.Fatal("removed a live owner's container")
	}
	_ = first.lock.Close()
	if err := os.WriteFile(fail, []byte("fail"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := newDockerLifecycle(work); err == nil {
		t.Fatal("unconfirmed cleanup allowed startup")
	}
	if _, err := os.Stat(record); err != nil {
		t.Fatal("unconfirmed record discarded")
	}
	if err := os.Remove(fail); err != nil {
		t.Fatal(err)
	}
	third, err := newDockerLifecycle(work)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(record); !os.IsNotExist(err) {
		t.Fatal("dead owner record retained after removal")
	}
	listed := "aaaaaaaaaaaa " + second.owner + "\n" + "bbbbbbbbbbbb " + strings.Repeat("b", 32) + "\n"
	if err := os.WriteFile(fail+".ps", []byte(listed), 0600); err != nil {
		t.Fatal(err)
	}
	fourth, err := newDockerLifecycle(work)
	if err != nil {
		t.Fatal(err)
	}
	calls, err := os.ReadFile(log)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains("\n"+string(calls), "\naaaaaaaaaaaa\n") || !strings.Contains("\n"+string(calls), "\nbbbbbbbbbbbb\n") {
		t.Fatalf("unexpected managed-container cleanup: %s", calls)
	}
	_ = fourth.lock.Close()
	if err := os.Remove(fail + ".ps"); err != nil {
		t.Fatal(err)
	}
	_ = second.lock.Close()
	_ = third.lock.Close()
	if err := os.WriteFile(fail+".info", []byte("fail"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := newDockerLifecycle(work); err == nil {
		t.Fatal("unavailable Docker allowed startup")
	}
}

func TestMissingImageDoesNotQuarantineSlot(t *testing.T) {
	bin := t.TempDir()
	work := t.TempDir()
	script := `#!/bin/sh
case "$1" in
info|ps) exit 0 ;;
create) echo 'Error response from daemon: No such image: missing' >&2; exit 1 ;;
rm) exit 1 ;;
esac
`
	if err := os.WriteFile(filepath.Join(bin, "docker"), []byte(script), 0755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	old := lifecycle
	defer func() { lifecycle = old }()
	var err error
	lifecycle, err = newDockerLifecycle(work)
	if err != nil {
		t.Fatal(err)
	}
	defer lifecycle.lock.Close()
	_, stderr, err := runDocker(context.Background(), []string{"run", "--rm", "missing"})
	if err == nil || !strings.Contains(stderr, "No such image") {
		t.Fatalf("unexpected create result: %q %v", stderr, err)
	}
	entries, err := os.ReadDir(lifecycle.dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if strings.HasSuffix(entry.Name(), ".job") {
			t.Fatal("missing image left a quarantined job")
		}
	}
}

func TestDefinitiveCreateFailureClassification(t *testing.T) {
	for _, diagnostic := range []string{"Error response from daemon: No such image: x", "unknown flag: --bad", "unknown shorthand flag: 'x'", "Error response from daemon: invalid reference format"} {
		if !definitiveCreateFailure(diagnostic) {
			t.Errorf("definitive failure not recognized: %q", diagnostic)
		}
	}
	for _, diagnostic := range []string{"connection reset by peer", "context deadline exceeded", "Error response from daemon: internal error", "No such container"} {
		if definitiveCreateFailure(diagnostic) {
			t.Errorf("ambiguous error treated as definitive: %q", diagnostic)
		}
	}
}

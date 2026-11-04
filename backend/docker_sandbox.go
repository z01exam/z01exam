package backend

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os/exec"
	"strings"
	"sync"
	"time"
)

// baseDockerRunArgs is shared by the official Go and JS runners.
func baseDockerRunArgs(_ string) []string {
	return []string{
		"--network", "none",
		"--pids-limit", getenvDefault("RUNNER_PIDS_LIMIT", "128"),
		"--memory", getenvDefault("RUNNER_MEMORY", "512m"),
		"--security-opt", "no-new-privileges",
		"--cap-drop", "ALL",
		"--tmpfs", "/tmp:rw,exec,nosuid,nodev,size=256m",
	}
}

func withOptionalCPULimit(args []string) []string {
	if cpus := strings.TrimSpace(getenvDefault("RUNNER_CPUS", "")); cpus != "" && cpus != "0" {
		return append(args, "--cpus", cpus)
	}
	return args
}

type dockerOutput struct {
	mu             sync.Mutex
	remaining      int
	stdout, stderr bytes.Buffer
	truncated      bool
}
type outputStream struct {
	output *dockerOutput
	stderr bool
}

func (w outputStream) Write(p []byte) (int, error) {
	w.output.mu.Lock()
	defer w.output.mu.Unlock()
	n := len(p)
	keep := n
	if keep > w.output.remaining {
		keep = w.output.remaining
		w.output.truncated = true
	}
	if w.stderr {
		_, _ = w.output.stderr.Write(p[:keep])
	} else {
		_, _ = w.output.stdout.Write(p[:keep])
	}
	w.output.remaining -= keep
	return n, nil
}
func runDocker(parent context.Context, args []string) (string, string, error) {
	ctx, cancel := context.WithTimeout(parent, runTimeout())
	defer cancel()
	var random [16]byte
	if _, err := rand.Read(random[:]); err != nil {
		return "", "", err
	}
	name := "z01exam-" + hex.EncodeToString(random[:])
	createArgs := []string{"create", "--name", name}
	for _, arg := range args[1:] {
		if arg != "--rm" {
			createArgs = append(createArgs, arg)
		}
	}
	create := exec.CommandContext(ctx, "docker", createArgs...)
	output := &dockerOutput{remaining: 1 << 20}
	create.Stdout, create.Stderr = outputStream{output, false}, outputStream{output, true}
	err := create.Run()
	if err == nil {
		output = &dockerOutput{remaining: 1 << 20}
		start := exec.CommandContext(ctx, "docker", "start", "--attach", name)
		start.Stdout, start.Stderr = outputStream{output, false}, outputStream{output, true}
		err = start.Run()
	}
	var cleanupErr error
	for i := 0; i < 3; i++ {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 3*time.Second)
		cleanupErr = exec.CommandContext(cleanupCtx, "docker", "rm", "-f", name).Run()
		cleanupCancel()
		if cleanupErr == nil || ctx.Err() == nil {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if ctx.Err() != nil {
		err = ctx.Err()
	} else if cleanupErr != nil && err == nil {
		err = fmt.Errorf("nettoyage du conteneur échoué: %w", cleanupErr)
	}
	stdout, stderr := output.stdout.String(), output.stderr.String()
	if output.truncated {
		stderr += "\n[sortie tronquée]"
	}
	return stdout, stderr, err
}

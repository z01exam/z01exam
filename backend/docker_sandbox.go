package backend

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
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
	if err := ctx.Err(); err != nil {
		return "", "", err
	}
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
	// Wait for create to finish even after cancellation: killing the CLI can
	// leave a daemon-side create still in flight after an attempted removal.
	create := exec.Command("docker", createArgs...)
	output := &dockerOutput{remaining: 1 << 20}
	create.Stdout, create.Stderr = outputStream{output, false}, outputStream{output, true}
	err := create.Run()
	created := err == nil
	if created && ctx.Err() == nil {
		output = &dockerOutput{remaining: 1 << 20}
		start := exec.CommandContext(ctx, "docker", "start", "--attach", name)
		start.Stdout, start.Stderr = outputStream{output, false}, outputStream{output, true}
		err = start.Run()
	}
	// Keep the admission slot until the named container is actually gone. This
	// fails closed during a daemon outage rather than accumulating orphans.
	for {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 3*time.Second)
		cleanup := exec.CommandContext(cleanupCtx, "docker", "rm", "-f", name)
		diagnostic := &dockerOutput{remaining: 4096}
		cleanup.Stdout, cleanup.Stderr = outputStream{diagnostic, false}, outputStream{diagnostic, true}
		cleanupErr := cleanup.Run()
		cleanupCancel()
		if cleanupErr == nil || strings.Contains(diagnostic.stderr.String(), "No such container") || !created {
			break
		}
		time.Sleep(time.Second)
	}
	if ctx.Err() != nil {
		err = ctx.Err()
	}
	stdout, stderr := output.stdout.String(), output.stderr.String()
	if output.truncated {
		stderr += "\n[sortie tronquée]"
	}
	return stdout, stderr, err
}

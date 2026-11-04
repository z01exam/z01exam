package backend

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// The lock is held for the process lifetime. The shared work directory lets a
// candidate and the active service distinguish each other's live containers.
type dockerLifecycle struct {
	owner, dir string
	lock       *os.File
}

var lifecycle *dockerLifecycle

func newDockerLifecycle(workDir string) (*dockerLifecycle, error) {
	dir := filepath.Join(workDir, ".z01exam-lifecycle")
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	var token [16]byte
	if _, err := rand.Read(token[:]); err != nil {
		return nil, err
	}
	owner := hex.EncodeToString(token[:])
	lock, err := os.OpenFile(filepath.Join(dir, owner+".lock"), os.O_CREATE|os.O_RDWR|os.O_EXCL, 0600)
	if err != nil {
		return nil, err
	}
	locked, err := tryFileLock(lock)
	if err != nil || !locked {
		lock.Close()
		if err == nil {
			err = fmt.Errorf("verrou du propriétaire déjà utilisé")
		}
		return nil, err
	}
	l := &dockerLifecycle{owner: owner, dir: dir, lock: lock}
	if err := l.reconcile(); err != nil {
		lock.Close()
		return nil, err
	}
	return l, nil
}

func dockerMaintenance(args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "docker", args...)
	cmd.WaitDelay = time.Second
	out := &dockerOutput{remaining: 1 << 20}
	cmd.Stdout, cmd.Stderr = outputStream{out, false}, outputStream{out, true}
	err := cmd.Run()
	if ctx.Err() != nil {
		return "", ctx.Err()
	}
	if err != nil {
		return "", fmt.Errorf("docker %s: %w (%s)", args[0], err, strings.TrimSpace(out.stderr.String()))
	}
	if out.truncated {
		return "", fmt.Errorf("sortie Docker de maintenance trop longue")
	}
	return out.stdout.String(), nil
}

func (l *dockerLifecycle) reconcile() error {
	reconciliationLock, err := os.OpenFile(filepath.Join(l.dir, "reconcile.lock"), os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return err
	}
	defer reconciliationLock.Close()
	locked, err := tryFileLock(reconciliationLock)
	if err != nil {
		return fmt.Errorf("verrou de réconciliation: %w", err)
	}
	if !locked {
		return fmt.Errorf("réconciliation déjà en cours")
	}
	defer unlockFile(reconciliationLock)
	// Verify readiness before accepting submissions, even if no old jobs exist.
	if _, err := dockerMaintenance("info"); err != nil {
		return err
	}
	entries, err := os.ReadDir(l.dir)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".job") {
			continue
		}
		parts := strings.Split(strings.TrimSuffix(entry.Name(), ".job"), ".")
		if len(parts) != 2 || len(parts[0]) != 32 || len(parts[1]) != 40 || !strings.HasPrefix(parts[1], "z01exam-") {
			return fmt.Errorf("enregistrement runner invalide: %s", entry.Name())
		}
		if _, err := hex.DecodeString(parts[0]); err != nil {
			return err
		}
		if _, err := hex.DecodeString(strings.TrimPrefix(parts[1], "z01exam-")); err != nil {
			return err
		}
		lock, err := os.OpenFile(filepath.Join(l.dir, parts[0]+".lock"), os.O_CREATE|os.O_RDWR, 0600)
		if err != nil {
			return err
		}
		locked, err := tryFileLock(lock)
		if err != nil {
			lock.Close()
			return err
		}
		if !locked {
			lock.Close()
			continue
		}
		// Not-found is ambiguous after an interrupted create: fail closed rather
		// than assume a daemon request cannot still materialize.
		_, err = dockerMaintenance("rm", "-f", parts[1])
		if err == nil {
			err = os.Remove(filepath.Join(l.dir, entry.Name()))
		}
		_ = unlockFile(lock)
		_ = lock.Close()
		if err != nil {
			return fmt.Errorf("réconciliation %s: %w", parts[1], err)
		}
	}
	// Also catch managed containers whose journal entry was lost. Never touch
	// a live owner, including an overlapping deployment candidate.
	listed, err := dockerMaintenance("ps", "-a", "--filter", "label=z01exam.managed=true", "--format", `{{.ID}} {{.Label "z01exam.owner"}}`)
	if err != nil {
		return err
	}
	for _, line := range strings.Split(strings.TrimSpace(listed), "\n") {
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) != 2 || len(fields[1]) != 32 {
			return fmt.Errorf("conteneur géré sans propriétaire valide: %s", line)
		}
		if len(fields[0]) < 12 || len(fields[0]) > 64 {
			return fmt.Errorf("identifiant conteneur invalide")
		}
		if _, err := hex.DecodeString(fields[0]); err != nil {
			return err
		}
		if _, err := hex.DecodeString(fields[1]); err != nil {
			return err
		}
		lock, err := os.OpenFile(filepath.Join(l.dir, fields[1]+".lock"), os.O_CREATE|os.O_RDWR, 0600)
		if err != nil {
			return err
		}
		locked, err := tryFileLock(lock)
		if err != nil {
			lock.Close()
			return err
		}
		if !locked {
			lock.Close()
			continue
		}
		_, err = dockerMaintenance("rm", "-f", fields[0])
		_ = unlockFile(lock)
		_ = lock.Close()
		if err != nil {
			return err
		}
	}
	return nil
}
func (l *dockerLifecycle) record(name string) (string, error) {
	path := filepath.Join(l.dir, l.owner+"."+name+".job")
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return "", err
	}
	if err = file.Close(); err != nil {
		return "", err
	}
	return path, nil
}

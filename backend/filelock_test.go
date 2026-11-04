package backend

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFileLockExcludesOtherHandlesAndReleasesOnClose(t *testing.T) {
	path := filepath.Join(t.TempDir(), "owner.lock")
	first, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		t.Fatal(err)
	}
	second, err := os.OpenFile(path, os.O_RDWR, 0600)
	if err != nil {
		first.Close()
		t.Fatal(err)
	}
	defer second.Close()
	locked, err := tryFileLock(first)
	if err != nil || !locked {
		first.Close()
		t.Fatalf("first lock: %v %v", locked, err)
	}
	locked, err = tryFileLock(second)
	if err != nil || locked {
		first.Close()
		t.Fatalf("second lock: %v %v", locked, err)
	}
	if err := first.Close(); err != nil {
		t.Fatal(err)
	}
	locked, err = tryFileLock(second)
	if err != nil || !locked {
		t.Fatalf("lock after close: %v %v", locked, err)
	}
	if err := unlockFile(second); err != nil {
		t.Fatal(err)
	}
}

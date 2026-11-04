//go:build windows

package backend

import (
	"os"
	"syscall"
	"unsafe"
)

var (
	kernel32     = syscall.NewLazyDLL("kernel32.dll")
	lockFileEx   = kernel32.NewProc("LockFileEx")
	unlockFileEx = kernel32.NewProc("UnlockFileEx")
)

// Lock one byte at offset zero. The lock remains associated with the handle
// until unlock, close, or process exit, just like the Unix lock.
func tryFileLock(file *os.File) (bool, error) {
	var overlap syscall.Overlapped
	const exclusiveAndFailImmediately = 0x2 | 0x1
	result, _, err := lockFileEx.Call(file.Fd(), exclusiveAndFailImmediately, 0, 1, 0, uintptr(unsafe.Pointer(&overlap)))
	if result != 0 {
		return true, nil
	}
	if err == syscall.Errno(33) {
		return false, nil
	} // ERROR_LOCK_VIOLATION
	return false, err
}
func unlockFile(file *os.File) error {
	var overlap syscall.Overlapped
	result, _, err := unlockFileEx.Call(file.Fd(), 0, 1, 0, uintptr(unsafe.Pointer(&overlap)))
	if result != 0 {
		return nil
	}
	return err
}

package backend

import (
	"strings"
	"testing"
)

func TestPinnedImage(t *testing.T) {
	want := officialImages["ghcr.io/01-edu/module-rust"]
	for _, in := range []string{
		"ghcr.io/01-edu/module-rust",
		"ghcr.io/01-edu/module-rust:latest",
		" ghcr.io/01-edu/module-rust ",
		"ghcr.io/01-edu/module-rust@sha256:aec07c54fcec37daffe2317fc93427523dc63b699fb5cd3a1880546978e7b4f6",
	} {
		if got := pinnedImage(in); got != want {
			t.Errorf("pinnedImage(%q) = %q, attendu %q", in, got, want)
		}
	}
	if got := pinnedImage("example.org/autre:1.0"); got != "example.org/autre:1.0" {
		t.Errorf("image inconnue modifiée : %q", got)
	}
}

func TestOfficialImagesArePinned(t *testing.T) {
	for name, ref := range officialImages {
		if !strings.HasPrefix(ref, name+"@sha256:") || len(ref) != len(name)+len("@sha256:")+64 {
			t.Errorf("%s n'est pas épinglée par un digest complet : %q", name, ref)
		}
	}
	for _, name := range []string{"test-go", "module-go", "module-js", "test-rust", "module-rust", "test-java", "module-java"} {
		if officialImage(name) == "ghcr.io/01-edu/"+name {
			t.Errorf("%s absente de la table des images", name)
		}
	}
}

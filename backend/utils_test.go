package backend

import "testing"

// Ces tests figent le comportement actuel de RewritePackage (ticket #22),
// y compris les cas discutables, sans le corriger.
func TestRewritePackage(t *testing.T) {
	tests := []struct {
		name, input, want string
	}{
		{
			name:  "sans ligne package, ajoute la clause en tête",
			input: "func main() {}\n",
			want:  "package student\n\nfunc main() {}\n",
		},
		{
			name:  "package en première ligne, remplacée",
			input: "package piscine\n\nfunc F() {}\n",
			want:  "package student\n\nfunc F() {}\n",
		},
		{
			name:  "lignes vides en tête, conservées",
			input: "\n\npackage main\n\nfunc main() {}\n",
			want:  "\n\npackage student\n\nfunc main() {}\n",
		},
		{
			name:  "indentation devant package, ligne remplacée sans indentation",
			input: "  \tpackage main\nfunc main() {}",
			want:  "package student\nfunc main() {}",
		},
		{
			name:  "commentaire avant package, second package ajouté en tête (comportement actuel)",
			input: "// Package piscine\npackage piscine\n",
			want:  "package student\n\n// Package piscine\npackage piscine\n",
		},
		{
			name:  "commentaire bloc avant package, second package ajouté en tête (comportement actuel)",
			input: "/* doc */\npackage piscine\n",
			want:  "package student\n\n/* doc */\npackage piscine\n",
		},
		{
			name:  "package suivi d'une tabulation non reconnu, second package ajouté (comportement actuel)",
			input: "package\tmain\n",
			want:  "package student\n\npackage\tmain\n",
		},
		{
			name:  "fins de ligne CRLF, ligne package remplacée",
			input: "package main\r\nfunc main() {}\r\n",
			want:  "package student\nfunc main() {}\r\n",
		},
		{
			name:  "code vide",
			input: "",
			want:  "package student\n\n",
		},
		{
			name:  "seulement des lignes vides",
			input: "\n \n",
			want:  "package student\n\n\n \n",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := RewritePackage(tt.input, "student"); got != tt.want {
				t.Errorf("RewritePackage(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestRewritePackageMain(t *testing.T) {
	if got, want := RewritePackage("package student\n", "main"), "package main\n"; got != want {
		t.Errorf("RewritePackage = %q, want %q", got, want)
	}
}

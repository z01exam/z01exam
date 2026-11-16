package backend

import "testing"

// Ces tests figent le comportement actuel de normalizeExerciseFileName
// (ticket #22) : les accents sont supprimés, pas translittérés.
func TestNormalizeExerciseFileName(t *testing.T) {
	tests := []struct {
		name, input, want string
	}{
		{"espaces en tirets", "Array Reverse Chunks", "array-reverse-chunks"},
		{"underscores et espaces en tirets", "array_reverse chunks", "array-reverse-chunks"},
		{"majuscules en minuscules", "FIZZBUZZ", "fizzbuzz"},
		{"chiffres conservés", "Exercise 42", "exercise-42"},
		{"espaces autour retirés", "  hello world  ", "hello-world"},
		{"accents supprimés, pas translittérés", "Évènement", "vnement"},
		{"tirets multiples et en bordure", "--a__b  c--", "a-b-c"},
		{"ponctuation supprimée", "isPrime?.md", "isprimemd"},
		{"symbole entre deux mots, tirets fusionnés", "a - b", "a-b"},
		{"chaîne vide", "", ""},
		{"seulement des symboles", "#!?*", ""},
		{"seulement des tirets et underscores", "-_ _-", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := normalizeExerciseFileName(tt.input); got != tt.want {
				t.Errorf("normalizeExerciseFileName(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

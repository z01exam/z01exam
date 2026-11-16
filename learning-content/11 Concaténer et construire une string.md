# Concaténer et construire une string

## Objectif
Construire une string efficacement et sans bugs.

## À savoir (essentiel)
- Concat simple: `res += ...` (ok sur petits inputs).
- Pour construire char par char: utiliser `[]byte` puis `string(b)`.
- `append` sur `[]byte` est pratique.

## Exemple
```go
package main

import "fmt"

func main() {
	s := "abc"
	var out []byte
	for i := 0; i < len(s); i++ {
		out = append(out, s[i])
		out = append(out, '-')
	}
	fmt.Println(string(out)) // "a-b-c-"
}
```

## Pièges fréquents
- `res +=` dans une boucle sur de gros inputs (lent).
- Ajouter un séparateur final non voulu.
- Construire avec `rune` alors que tu veux ASCII.

## Check rapide
- Je sais construire avec `[]byte`.
- Je sais convertir `[]byte` -> `string`.
- Je sais contrôler séparateurs et fin de chaîne.

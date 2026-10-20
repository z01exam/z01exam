package backend

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"sync"
)

// zoneCatalogURL est le catalogue public du campus de Rouen : examens,
// checkpoints, exercices, énoncés et image de chaque moulinette.
const zoneCatalogURL = "https://zone01normandie.org/api/object/rouen"

var (
	zoneCatalogMu    sync.Mutex
	zoneCatalogCache *zoneRustNode
)

// zoneCatalog télécharge le catalogue une seule fois par démarrage : Go,
// Rust et Java le partagent. Un échec n'est pas mémorisé.
func zoneCatalog(ctx context.Context) (zoneRustNode, error) {
	zoneCatalogMu.Lock()
	defer zoneCatalogMu.Unlock()
	if zoneCatalogCache != nil {
		return *zoneCatalogCache, nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, zoneCatalogURL, nil)
	if err != nil {
		return zoneRustNode{}, err
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return zoneRustNode{}, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return zoneRustNode{}, fmt.Errorf("catalogue Zone01: HTTP %d", res.StatusCode)
	}
	var root zoneRustNode
	if err := json.NewDecoder(res.Body).Decode(&root); err != nil {
		return zoneRustNode{}, err
	}
	zoneCatalogCache = &root
	return root, nil
}

// zoneExam désigne un examen ou checkpoint du catalogue à proposer.
type zoneExam struct {
	path  string // chemin dans le catalogue, ex. /rouen/cursus-cda/checkpoint
	image string // moulinette si le catalogue n'en annonce pas
}

// zoneExamExercise est un exercice d'examen tel que le catalogue le décrit.
type zoneExamExercise struct {
	exam  zoneExam
	node  zoneRustNode
	image string // moulinette épinglée
}

// collectZoneExercises parcourt le catalogue et renvoie les exercices des
// examens demandés, avec leur moulinette épinglée.
func collectZoneExercises(root zoneRustNode, exams []zoneExam) []zoneExamExercise {
	byPath := make(map[string]zoneExam, len(exams))
	for _, e := range exams {
		byPath[e.path] = e
	}
	var found []zoneExamExercise
	var visit func(zoneRustNode)
	visit = func(node zoneRustNode) {
		if exam, ok := byPath[node.Path]; ok {
			for _, child := range node.Children {
				if child.Type != "exercise" || child.Key == "" {
					continue
				}
				image := exam.image
				for _, validation := range child.Attrs.Validations {
					if validation.Type == "tester" && validation.TestImage != "" {
						image = validation.TestImage
						break
					}
				}
				found = append(found, zoneExamExercise{exam: exam, node: child, image: pinnedImage(image)})
			}
			return
		}
		for _, child := range node.Children {
			visit(child)
		}
	}
	visit(root)
	return found
}

// sortExercises trie par titre.
func sortExercises(list []Exercise) {
	sort.SliceStable(list, func(i, j int) bool {
		return strings.ToLower(list[i].Title) < strings.ToLower(list[j].Title)
	})
}

// hydrateZoneStatements remplace l'énoncé provisoire par l'énoncé officiel.
// Un échec garde l'énoncé provisoire : une panne passagère des contenus
// Zone01 ne doit pas empêcher l'application de démarrer.
func hydrateZoneStatements(ctx context.Context, exercises []Exercise) {
	jobs := make(chan int)
	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range jobs {
				if statement, err := fetchZoneStatement(ctx, exercises[i].SubjectURL); err == nil && statement != "" {
					exercises[i].Statement = statement
				}
			}
		}()
	}
	for i := range exercises {
		jobs <- i
	}
	close(jobs)
	wg.Wait()
}

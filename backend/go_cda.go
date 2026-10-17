package backend

import "context"

// goExams : le checkpoint Go du cursus actuel (CDA). Les examens de la
// Piscine Go restent servis depuis exam-instructions avec test-go.
var goExams = []zoneExam{
	{path: "/rouen/cursus-cda/checkpoint", label: "Checkpoint CDA · ", image: "ghcr.io/01-edu/module-go"},
}

// LoadGoCheckpointExercises charge le checkpoint Go du CDA depuis le
// catalogue Zone01, avec ses énoncés officiels et la moulinette module-go.
func LoadGoCheckpointExercises() ([]Exercise, error) {
	ctx, cancel := context.WithTimeout(context.Background(), runTimeout())
	defer cancel()
	root, err := zoneCatalog(ctx)
	if err != nil {
		return nil, err
	}
	var list []Exercise
	for _, found := range collectZoneExercises(root, goExams) {
		key := found.node.Key
		list = append(list, Exercise{
			ID:         "cda-" + key,
			Title:      found.exam.label + key,
			Statement:  "## Énoncé Go\n\nChargement de l’énoncé officiel Zone01 : `" + found.node.Attrs.Subject + "`.",
			Template:   "package piscine\n\n// Implémente " + key + " comme décrit dans l'énoncé.\n",
			Runner:     key,
			Image:      found.image,
			SubjectURL: found.node.Attrs.Subject,
		})
	}
	sortExercises(list)
	hydrateZoneStatements(ctx, list)
	return list, nil
}

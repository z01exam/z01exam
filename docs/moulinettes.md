# Moulinettes officielles

Z01EXAM corrige chaque exercice avec l'image Docker officielle 01-edu que le
catalogue Zone01 associe à son examen. Seuls les examens et checkpoints sont
proposés, jamais les quêtes.

## Images utilisées

Les images sont épinglées par digest dans `backend/images.go` (relevé du
18 octobre 2026). Le catalogue Zone01 ne donne que le nom de l'image : sans
épinglage, un serveur garderait indéfiniment la copie téléchargée la première
fois.

| Parcours | Ensemble | Image | Exercices |
| --- | --- | --- | --- |
| Go | Checkpoint CDA | `module-go` | 61 |
| JavaScript | Checkpoint JS | `module-js` | 31 |
| Rust | Checkpoints CDA | `module-rust` | 38 |
| Java | Checkpoints CDA 01 à 03 | `module-java` | 45 |

Seule la version actuelle de la formation (CDA) est proposée, sans doublon.
Les anciennes versions (Piscine Go avec `test-go`, cursus div-01 avec
`test-rust` et `test-java`) restent dans l'historique Git. `test-go` reste
épinglée comme image Go par défaut (`RUNNER_GO_DOCKER_IMAGE`).

## Contrats à respecter

- **Go** : le code est monté dans `student/` et `/root/piscine-go`
  (dossier de travail `/test-go` pour `module-go`) ; `EXERCISE` désigne
  l'exercice.
- **Rust** : un projet Cargo par exercice ; les tests sont dans l'image.
- **Java** : les fichiers sont attendus dans `student/<Exercice>/`, avec le
  nom de chaque type public. Un exercice peut attendre plusieurs fichiers
  (`todo-list` : `Task.java` et `TodoList.java`) : le code saisi est découpé
  en un fichier par type public.
- **JavaScript** : les tests de `Js_exam_test/` sont ceux de `module-js`.

## Mettre une image à jour

1. Relever le digest du tag `latest` sur `ghcr.io/01-edu/<image>`.
2. Le reporter dans `backend/images.go`.
3. Relancer les moulinettes de bout en bout, depuis `backend/` :

   ```sh
   RUN_OFFICIAL_E2E=1 go test -run TestOfficialE2E -timeout 3h -v .
   ```

   Les solutions officielles embarquées dans l'image Go doivent passer,
   quelques solutions Rust et Java écrites à la main aussi (ces images n'en
   embarquent pas), et le modèle
   vide de chaque exercice doit échouer sur une vraie erreur de compilation
   ou de test, jamais sur une erreur du correcteur.
4. Télécharger les nouvelles images sur le serveur avant le déploiement.

Quelques solutions officielles sont refusées par leur propre image (code non
formaté selon `gofumpt`, ou fonction nommée `print`) : le test les signale
comme ignorées, avec la raison, dans `officialGoSolutionDefects`.

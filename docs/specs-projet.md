# Specs du projet FakeExam

FakeExam permet de s'entraîner aux **examens et checkpoints Zone01** depuis le
navigateur (Go, JavaScript, Rust, Java ; modes Exam, True Exam, Learning).
Les quêtes ne font pas partie du projet.

## Stack imposée
- **Back** : Go 1.22, bibliothèque standard d'abord.
- **Front** : HTML, CSS et JavaScript natifs. Pas de framework (React, Vue,
  Django…), pas d'étape de build, pas de npm.
- **Exécution** : Docker et les images officielles `ghcr.io/01-edu/*`.

Une nouvelle dépendance, un nouveau langage, une base de données ou un service
externe se décident **ici, avant de coder**.

## Trois briques
- **Interface** (`cmd/web`) : pages, styles, proxy. Jamais Docker.
- **Catalogue** (`cmd/catalog`) : énoncés et sources Zone01. N'exécute aucun
  code élève.
- **Correcteur** (`cmd/runner`) : moulinettes isolées, sans réseau.

Une modification touche **une seule brique** et garde ses contrats HTTP
(`GET /api/exercises`, `POST /api/run`). Détails :
`docs/architecture-services.md`.

## Règles
- Un ticket = une branche `42-description` = une PR avec `Closes #42`.
- Changement ciblé, vérifié avec `make start` et `go test ./...`.
- Aucun secret, adresse de serveur ou donnée personnelle dans le dépôt.
- On ne touche pas à `.github/workflows/` ni au déploiement sans ticket.

## Ta proposition
Explique dans la discussion :
1. ce que tu as compris du ticket ;
2. ce que tu veux faire, dans quelle brique, avec quels outils ;
3. pourquoi c'est la bonne solution pour FakeExam (simple, dans la stack).

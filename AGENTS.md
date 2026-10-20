# Instructions du dépôt

## Git et livraison

- Ne jamais pousser directement sur `main` : elle est protégée.
- Travailler sur une branche liée au ticket (`42-description-courte`) et ouvrir
  une pull request, en brouillon dès le premier commit.
- Une PR = un seul ticket, avec `Closes #N` dans la description.
- La fusion est faite par le mainteneur principal après relecture et CI verte.
- La production est déployée automatiquement à chaque fusion sur `main` dont
  la CI est verte (`.github/workflows/deploy.yml`). Ne jamais lancer de
  déploiement à la main sans l'accord du mainteneur principal.

## Périmètre

- Respecter les rôles décrits dans `docs/architecture-services.md` : une
  modification ne touche qu'une brique (interface, catalogue, correcteur)
  et garde ses contrats HTTP.
- Ne pas modifier `.github/workflows/`, `scripts/deploy_vps.sh` ni
  `.github/CODEOWNERS` sans ticket explicite.
- Ne jamais écrire de secret, d'adresse de serveur ni de donnée personnelle
  dans le dépôt.

## Qualité

- Garder les changements ciblés et vérifier le comportement concerné avant de
  demander une relecture (`make start`, `go test ./...` dans `backend/`).
- Ne pas modifier ou supprimer des tests uniquement pour obtenir un passage au
  vert.

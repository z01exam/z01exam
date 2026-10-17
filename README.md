# Z01EXAM

Plateforme communautaire, créée par et pour les apprenants Zone01, pour
s'entraîner aux examens depuis un navigateur : [z01exam.online](https://z01exam.online).
Elle propose les parcours Go, JavaScript, Rust et Java, avec les modes
**Exam**, **True Exam** et **Learning**.

> Projet communautaire et non officiel, réalisé par des apprenants. Il n'est
> ni édité ni validé par Zone01.

## Stack et architecture

| Élément | Rôle |
| --- | --- |
| Go 1.22 (standard library) | Serveur HTTP et API |
| HTML, CSS, JavaScript natif | Interface et éditeur dans le navigateur |
| `marked` via jsDelivr | Rendu des énoncés Markdown |
| Docker | Exécution isolée des soumissions |
| Images `ghcr.io/01-edu/*` | Moulinettes de test officielles Zone01 |
| Render / systemd | Déploiement |

Le serveur Go sert le frontend statique et deux routes :

- `GET /api/exercises?track=go|js|rust|java` : catalogue des exercices ;
- `POST /api/run` : exécution de la soumission dans Docker.

Le projet peut désormais être déployé comme trois services indépendants
(Web, Catalogue et Runner) tout en conservant le mode monolithique par défaut
pour la compatibilité. Les responsabilités, dépendances, contrats et procédure
de bascule sont documentés dans [l'architecture des services](docs/architecture-services.md).

## Contenus et sécurité

- Go et JavaScript : énoncés Markdown open source stockés dans
  `exam-instructions/` et `Js_exam_instructions/`.
- Rust, Java et checkpoint Go CDA : catalogues et énoncés open source
  chargés depuis l'API Zone01 ; leurs images de test sont déterminées par le
  catalogue officiel. Les images, épinglées par digest, et les archives de
  l'ancien cursus sont décrites dans [les moulinettes](docs/moulinettes.md).
- Les tests s'exécutent uniquement avec `RUNNER_MODE=docker`, sans réseau,
  avec limites de mémoire et de processus, un `tmpfs` temporaire et les
  capacités Linux retirées. Une limite CPU n'est appliquée que si
  `RUNNER_CPUS` est définie.

## Lancer localement

Prérequis : Go 1.22 ou supérieur, GNU Make et Git. Pour exécuter les
soumissions, démarrer Docker (Docker Desktop en mode conteneurs Linux sur
Windows/macOS, Docker Engine ou Desktop sur Linux). Les images officielles
sont téléchargées à la première soumission si nécessaire.

```sh
make start
```

Depuis la racine du dépôt, cette commande fonctionne sur Windows, macOS et
Linux sans script Bash. Si Make n'est pas installé, la même entrée se lance
avec `go -C backend run ./cmd/dev`. Sur Windows, utiliser GNU Make (`make`),
pas `nmake`. Installer les prérequis avant le premier lancement.

Puis ouvrir `http://localhost:8080`. Le serveur local écoute uniquement sur
`127.0.0.1`. La variable d'environnement `PORT` permet de changer le port ;
`LISTEN_ADDR` permet de choisir explicitement l'adresse d'écoute. Arrêter avec
Ctrl+C. Sans Docker, l'interface reste accessible mais les soumissions échouent
avec un diagnostic Docker.

Le SHA court du binaire exécuté apparaît en bas à droite ; le SHA complet est
disponible via `GET /api/version`. En local, les changements non commités sont
signalés par « modifié ». Une archive sans métadonnées Git affiche « version
inconnue ». La livraison VPS incorpore explicitement le SHA dans le binaire.

## Déployer

`render.yaml` construit le backend Go et lance le binaire `server`. En
production, le déploiement est manuel : le workflow GitHub Actions attend
l'approbation du mainteneur sur l'environnement `Production`, puis transmet le
SHA attendu à `scripts/deploy_vps.sh`, qui construit, teste et bascule la
nouvelle version avec retour arrière automatique. La documentation
d'exploitation du serveur est tenue dans un dépôt privé.

## Contribuer

Les contributions des apprenants sont les bienvenues : ouvrir une issue ou une
pull request avec un changement ciblé et testé. Le parcours pas à pas est
décrit dans [CONTRIBUTING.md](CONTRIBUTING.md). Le lien Discord de la
communauté est disponible dans l'interface.

## Licence

Le code de Z01EXAM est disponible au choix sous [Apache-2.0](LICENSE-APACHE)
ou [MIT](LICENSE-MIT). Les contenus pédagogiques open source et les
dépendances externes conservent leurs notices et conditions respectives.

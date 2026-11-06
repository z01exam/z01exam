# True Exam (ticket #8)

## 1. Vue d’ensemble et cycle de vie

True Exam simule un examen chronométré côté navigateur ; Exam et Learning restent inchangés.

- `ready` : préparation, choix du langage et bouton Start. Aucun tirage ni minuteur ;
  Run et l’éditeur sont désactivés.
- `running` : série initialisée, langage verrouillé, compteur dans l’en-tête et
  progression au-dessus de l’énoncé. Next/Previous et restart restent indisponibles.
- `finished` : aucune nouvelle évaluation. Une finalisation affiche le bilan plein
  écran ; un abandon invalide la session et efface ses brouillons.

Chaque examen reçoit un UUID. Les brouillons, résultats et positions appartiennent
à cet UUID ; un nouvel examen n’hérite ni du code ni des résultats du précédent.

## 2. Minuteur et progression des exercices

La durée est de **3 heures (10 800 secondes)**. `startedAt` et `endsAt` sont des timestamps Unix
en millisecondes ; l’affichage utilise `Math.max(0, endsAt - Date.now())`. L’unique
intervalle ne décrémente rien ; toute reprise conserve les timestamps d’origine.

Une seule évaluation True Exam est autorisée à la fois. Un jeton mémoire capture
l’objet de session, son UUID, l’ID d’exercice et son index ; Run et les appels répétés
sont bloqués pendant la requête. Ces identités et l’échéance sont vérifiées avant
tout comptage ou changement d’exercice.

Seules les réponses HTTP réussies avec `success` booléen comptent, pour la session
et l’exercice encore actifs. Erreurs réseau/HTTP, JSON invalides et réponses tardives
ne créent aucune tentative.

- Échec : conserver l’exercice, le code et la sortie, puis autoriser une autre tentative.
- Réussite : conserver tentatives et brouillon, avancer d’une position et appeler
  `selectExercise()`. Le nouvel exercice reçoit son propre brouillon, ou un code vide.
  Sa console est effacée pour ne pas lui attribuer le résultat précédent.
- Dernière réussite : ouvrir directement le bilan `completed`, sans exercice vide.

La transition sauvegarde position, résultats et code ensemble, sans nouveau tirage
ni redémarrage du minuteur. Le jeton n’est pas persisté : F5 invalide la requête sans
la rejouer. `finally` ne libère Run que pour ce même jeton ; une ancienne réponse
ne peut pas réactiver les contrôles d’une autre requête ou session.

Chaque réponse acceptée incrémente `results[id].attempts` ; `success` reste vrai dès
la première réussite. Les catégories sont exclusives et couvrent toute la série :

| Catégorie | Condition |
| --- | --- |
| Réussi | `success === true` |
| Non réussi | `attempts > 0`, sans réussite |
| Non tenté | `attempts === 0` |

Les statistiques viennent des évaluations acceptées, jamais de l’index.

## 3. Persistance et reprise de session

La clé `localStorage` **`z01exam-true-exam-session`** utilise le schéma **v2** :

| Champs d’une session active | Rôle |
| --- | --- |
| `version`, `id`, `track` | Schéma, UUID et langage |
| `exerciseIds`, `index`, `exerciseId` | IDs dans l’ordre du tirage et position courante |
| `code`, `drafts`, `results` | Code courant, brouillons et `{attempts, success}` par ID |
| `startedAt`, `endsAt` | Timestamps d’origine |
| `status`, `finishReason` | État et motif terminal, ou `null` en cours |
| `savedAt`, `interruptedAt` | Dernière sauvegarde et départ détecté, ou `null` |
| `tabId`, `ownerId` | Identités de l’onglet et du document propriétaire |

Un état terminal conserve `{version, id, status: "finished", finishReason}` : référence
au bilan par UUID pour une fin normale, sans code ni progression pour `abandoned`.
Les marqueurs terminaux v1 restent reconnus.

La sauvegarde suit démarrage, changement autorisé d’exercice, évaluation acceptée,
finalisation et abandon. La saisie, y compris les éditions personnalisées du mini-IDE,
est regroupée sur 250 ms ; visibilité et `pagehide` vident les écritures en attente.
Aucun énoncé complet, code par tentative ou sortie du runner n’est stocké.

La sauvegarde prend la main avant `loadExercises()`. Pendant sa restauration,
Start, Run, mode, langage et éditeur sont bloqués. Après validation et acquisition
de la propriété d’écriture, la série est reconstruite par IDs dans l’ordre enregistré,
puis l’exercice, le code, les résultats et le minuteur sont rétablis sans nouveau tirage.
La restauration crée un nouvel objet de session, invalidant les anciennes réponses.

Les snapshots complets v1 sont validés puis migrés sans modifier IDs, code ou délai.
Leurs compteurs non enregistrés commencent à zéro ; `expired` et `interruption`
deviennent `time_expired` et `interruption_timeout`. Une ancienne fin garde son motif ;
`savedAt` sert de meilleur timestamp disponible si l’heure réelle n’était pas enregistrée.

JSON invalide, version inconnue, timestamps/index incohérents ou ID absent/ambigu :
message de reprise impossible, Run bloqué et sauvegarde conservée, jamais de série
aléatoire de remplacement. Réessayer par F5 si le catalogue échoue ; pour une donnée
irrécupérable, conserver éventuellement son JSON puis supprimer explicitement la clé.

`pagehide` sauvegarde `interruptedAt` et le code, arrête le minuteur, efface l’état
et l’éditeur en mémoire, puis libère le verrou. Le document suspendu garde l’UUID
attendu ; `pageshow.persisted` traite son éventuel retour depuis le cache.

Une interruption détectée de **plus de 300 000 ms** interdit la reprise ; exactement
cinq minutes reste autorisé. Un chargement `reload` avec le même `tabId` (conservé
en `sessionStorage`) est considéré comme F5, sans restriction supplémentaire.
L’échéance originale reste prioritaire ; une session terminée ne redevient pas active.

`visibilitychange` ne définit jamais une interruption et ne libère pas le verrou :
un onglet masqué continue l’examen. Aucun heartbeat ne sert à déduire une fermeture.

## 4. Finalisation, abandon et bilan

| Motif terminal | Déclencheur | Bilan |
| --- | --- | --- |
| `time_expired` | Échéance originale atteinte | Oui, fin à `endsAt` |
| `completed` | Dernier exercice validé | Oui |
| `submitted_early` | « Terminer l’examen » confirmé avant l’échéance | Oui |
| `interruption_timeout` | Fenêtre de reprise dépassée | Oui, fin à la limite de reprise |
| `abandoned` | Back reconnu ou sortie confirmée d’une session active | Non |

`finishTrueExamSession()` est idempotente : fermer l’acceptation des évaluations,
arrêter le minuteur et fixer `completedAt` avant le bilan. Un réveil tardif indique
au plus trois heures utilisées. Une remise confirmée après l’échéance est une
expiration. Une fin acquise ne peut être reclassée par une sortie ou par l’historique.

« Terminer l’examen » demande confirmation : remise définitive, exercices non réussis
incomplets et bilan généré, sans reprise possible. Annuler conserve la session.
Cette remise diffère d’un abandon, qui efface aussi le code et la mémoire ; si écrire
le marqueur d’abandon échoue, une suppression de la clé active est tentée.

**`z01exam-true-exam-report`** conserve le dernier bilan, schéma **v1** : UUID,
langage, IDs sélectionnés ; résultats ordonnés (`id`, `title`, `level`, `attempts`,
`success`) ; `startedAt`, `completedAt`, `endsAt`, `reason` ; `summary` avec les trois
catégories, les soumissions, `usedMs` et `durationMs`. Il ne contient aucun brouillon.

Écrit avant le marqueur terminal, le bilan du même UUID reste prioritaire même si
ce marqueur n’a pas pu être remplacé. Sa validation recalcule les statistiques et
contrôle IDs, compteurs, timestamps et motif. F5 le restaure sans attendre le catalogue ;
un bilan absent ou invalide ne réouvre jamais un examen exécutable.

Le bilan remplace tout l’espace de travail : commandes de programmation, énoncé,
barre latérale, éditeur, console et compteur sont masqués ; l’éditeur est vidé et
désactivé. Résumé, statistiques et table utilisent des nœuds DOM et `textContent`.

« Nouvel examen » revient à la préparation sans tirage ni minuteur ; le prochain
Start crée l’UUID neuf. « Quitter » revient à Exam sans confirmation d’abandon.
Ces actions retirent le pointeur actif, conservent le bilan et empêchent son retour
automatique par F5 sur la préparation ou Exam. Les erreurs de stockage n’arrêtent
pas l’examen ni le bilan en mémoire ; un avertissement signale la persistance incertaine.

## 5. Navigation navigateur et protection entre onglets

`armTrueExamHistoryGuard()` marque une entrée `base` par `replaceState`, puis ajoute
une entrée `exam` à la même URL par `pushState`. `history.state.z01examTrueExam`
contient seulement `guardId`, `sessionId`, `kind` et préserve les autres propriétés.
Back atteint la base dans le même document : `popstate` consomme le garde, abandonne
l’examen actif, puis appelle une seule fois `history.back()` pour quitter l’application.
Un seul clic utilisateur suffit ; la paire est réutilisée après F5 et pour les examens
suivants, sans accumulation. Back peut aussi invalider une reprise encore en chargement.

F5 et fermeture ne traversent pas cette paire. La Navigation API complète le garde
pour les sauts arrière identifiables, sans interception. `pagehide` seul, un événement
annulé ou un index inconnu ne prouve pas un abandon.

Forward ne reprend pas un abandon et ne déclenche aucun retour automatique.
Depuis le cache, la reprise relit le snapshot et vérifie l’UUID attendu : un UUID
remplacé, un abandon ou un snapshot absent laisse l’éditeur vide. `autocomplete="off"`
évite aussi la restauration native de l’ancien code par l’historique des formulaires.

Web Locks garde un verrou exclusif pendant l’examen, même masqué, jusqu’au départ,
à la sortie ou à la finalisation. Sans lui, propriétaire enregistré et événements
`storage` protègent les écritures/évaluations, sans atomicité. Le document perdant
la propriété arrête son minuteur et ses évaluations sans écraser l’autre snapshot.

## 6. Limites connues

- La paire ajoute une entrée visible ; Forward peut montrer deux entrées inactives.
  Sans page antérieure, Back abandonne mais ne peut quitter vers une page inexistante.
- History API refusée, entrées scriptées supprimées/sautées, absence de `popstate`,
  sauts multiples ou entrées ajoutées par fragments/autres scripts : abandon non garanti.
  Une erreur d’installation est signalée ; un saut ambigu conserve la reprise normale.
- Sans `pagehide` (certains crashes/mobiles), l’heure de fermeture est inconnue :
  avec Web Locks, seule l’échéance reste vérifiable ; sans lui, un propriétaire inconnu
  non libéré est refusé. Un onglet restauré peut aussi ressembler à F5.
- Sans verrou atomique, onglets dupliqués partageant `sessionStorage` et ouvertures
  simultanées restent ambigus. Un crash avant sauvegarde peut perdre les dernières frappes.
- Stockage indisponible/effacé ou horloge modifiée : aucune garantie de reprise ;
  protection entre onglets dégradée et abandon non mémorisable si écriture/suppression échouent.
- Un seul bilan local est conservé, sans historique multi-examens, compte ni stockage serveur.
  Aucune synchronisation entre appareils. Firefox 156 vérifié, pas toutes les versions.

Références : [popstate](https://developer.mozilla.org/en-US/docs/Web/API/Window/popstate_event),
[History API](https://developer.mozilla.org/en-US/docs/Web/API/History/pushState),
[pagehide](https://developer.mozilla.org/en-US/docs/Web/API/Window/pagehide_event),
[type de navigation](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceNavigationTiming/type),
[Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API).

## 7. Vérifications

```sh
node --test tests/true-exam-timer.test.cjs
node --check app.js
node --check tests/firefox-history-check.cjs
go -C backend test ./...
git diff --check
```

Les tests unitaires couvrent progression, reprise, concurrence, fins et statistiques
avec temps, stockage, événements, verrous et évaluations simulés, sans navigateur réel.
Pour le scénario Firefox, démarrer `make start` et `geckodriver --port 4444` dans deux
terminaux, puis lancer les deux variantes :

```sh
node tests/firefox-history-check.cjs
DISABLE_NAVIGATION_API=1 node tests/firefox-history-check.cjs
```

`Z01EXAM_URL` et `GECKODRIVER_URL` changent les adresses locales. Le scénario couvre
F5, Back/Forward, cache, progression et bilan/actions. Les deux variantes ont réussi
sur Firefox 156, avec retour du même document depuis le cache confirmé par marqueur DOM.
Les réponses de grading sont simulées, sans exécution réelle dans Docker.

Vérification manuelle courte : tester les quatre langages, échec puis réussite et F5 ;
masquer vingt minutes puis reprendre ; fermer trois/six minutes ; vérifier Back/Forward
en un clic, second onglet et absence de boucles ; enfin remise annulée/confirmée,
nouvel examen, bilan et petit écran. Vrai runner pour les solutions, horloge contrôlée pour les fins.

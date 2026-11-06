# True Exam — minuteur, reprise et bilan (ticket #8)

## Cycle de vie et interface

- `ready` : préparation dans la zone de l’énoncé, choix du langage et bouton
  principal. Aucune série n’est générée ; Run et l’éditeur sont désactivés.
- `running` : une série valide démarre après clic explicite. Le langage est
  verrouillé, le compteur reste dans l’en-tête et la progression compacte
  précède l’énoncé. Next/restart restent masqués et bloqués.
- `finished` : état terminal, sans nouvelle évaluation. Une fin normale conserve
  les résultats et affiche le bilan plein écran ; un abandon invalide la session
  et efface les brouillons. Une validation réussie ne fait pas encore avancer.

La durée reste de 10 800 secondes. Le temps restant est calculé depuis
`endsAt - Date.now()` ; l’unique intervalle ne fait que rafraîchir l’affichage.
La reprise réutilise `startedAt` et `endsAt`, sans modifier l’échéance.

## Snapshot local

La clé `localStorage` est `z01exam-true-exam-session`. Le schéma courant **v2**, pour une session active, contient :

| Champs | Rôle |
| --- | --- |
| `version`, `id` | Version et UUID de la session |
| `track`, `exerciseIds` | Langage et IDs de la série, dans l’ordre du tirage |
| `index`, `exerciseId` | Position et exercice courant |
| `code`, `drafts` | Code exact courant et brouillons par ID d’exercice |
| `startedAt`, `endsAt` | Timestamps Unix en millisecondes, d’origine |
| `status`, `finishReason` | État et motif terminal canonique, ou `null` en cours |
| `results` | Par ID : `{attempts, success}` pour les évaluations acceptées |
| `savedAt`, `interruptedAt` | Dernière sauvegarde et départ détecté, ou `null` |
| `tabId`, `ownerId` | Identités de l’onglet et du document propriétaire |

Les brouillons et la progression appartiennent exclusivement à `id` : une nouvelle
session reçoit un nouvel UUID et des brouillons vides. Un abandon ne conserve
qu’une marque `{version, id, status: "finished", finishReason: "abandoned"}`,
sans code ni progression. Une fin avec bilan garde la même forme minimale avec
son motif de fin ; l’UUID référence alors le bilan indépendant. Les marqueurs
terminaux v1 restent reconnus.

Aucun énoncé complet, code exécuté par tentative ou sortie du runner n’est stocké.
Les compteurs et réussites sont conservés ; il n’y a pas d’historique détaillé des
soumissions. Un identifiant d’onglet en `sessionStorage` aide à reconnaître F5.

La sauvegarde s’effectue au démarrage, lors d’un changement autorisé d’exercice,
après chaque évaluation acceptée, à la finalisation et à l’abandon. La saisie est regroupée sur 250 ms ; les éditions
personnalisées du mini-IDE sont aussi prises en compte. Les changements de
visibilité et `pagehide` vident les écritures en attente. Les erreurs de stockage
s’affichent dans la console de l’application et n’arrêtent pas l’examen en mémoire.

## Initialisation et restauration

Après le choix initial du mode/langage, la présence d’une sauvegarde prend la
main **avant** `loadExercises()`. Pendant le chargement, Start, Run, les changements
de mode/langage et l’éditeur sont bloqués. Une fois les catalogues chargés :

1. Acquérir la propriété d’écriture et relire/valider le snapshot.
2. Restaurer le langage et reconstruire la série par IDs dans l’ordre enregistré.
3. Afficher l’exercice sauvegardé, puis rétablir son code exact et ses brouillons.
4. Réinitialiser le minuteur avec les timestamps d’origine et rafraîchir l’interface.

Aucun tirage aléatoire n’intervient lors de la reprise. Les réponses asynchrones
restent liées à l’objet de session en mémoire : une restauration crée un nouvel
objet et rend les anciennes réponses inapplicables.

Un marqueur de session terminée restaure le bilan sans attendre les catalogues :
ses titres et niveaux sont déjà enregistrés. Si un bilan du même UUID existe mais
que le marqueur actif n’a pas pu être remplacé, ce bilan reste prioritaire sur une
reprise. Un bilan manquant ou invalide ne réouvre jamais une session exécutable.

Les sauvegardes complètes v1 sont validées puis migrées en v2 sans nouveau tirage,
ni modification des timestamps/code. Les compteurs non enregistrés par v1
commencent à zéro : aucun succès n’est déduit de la position. Les motifs hérités
`expired` et `interruption` deviennent `time_expired` et `interruption_timeout`.
Une ancienne session déjà terminée génère son bilan ; son motif est conservé.
Pour ces anciennes fins seulement, `savedAt` est le meilleur timestamp disponible
quand l’heure réelle de finalisation n’avait pas été enregistrée.

Un JSON invalide, un schéma inconnu, des timestamps incohérents, un index invalide
ou un ID absent/ambigu donnent un message de reprise impossible et bloquent Run.
La sauvegarde est conservée, sans substitution silencieuse par une nouvelle série.
Un échec du catalogue permet de réessayer par rechargement. Pour une sauvegarde
irrécupérable, conserver éventuellement son JSON, puis supprimer explicitement
cette clé dans les outils du navigateur avant de démarrer un autre examen.

## Rechargement, interruption et arrière-plan

`pagehide` sauvegarde le code et `interruptedAt`, arrête l’intervalle, efface
l’état de session et l’éditeur du document en mémoire, puis libère le verrou.
Le document suspendu ne retient que l’UUID attendu pour son éventuel retour du cache. Lors du retour, une interruption détectée de **plus de 300 000 ms**
interdit la reprise. Un retour à exactement cinq minutes reste autorisé.
`pageshow.persisted` traite également les retours depuis le cache de navigation.

Un type de navigation `reload` associé au même `tabId` est considéré comme un
rechargement normal : la restriction supplémentaire des cinq minutes ne s’applique
pas. L’échéance d’origine reste toujours prioritaire. Une session déjà marquée
`finished` ne redevient jamais active par un autre F5.

Un simple `visibilitychange` ne définit jamais `interruptedAt` et ne libère pas
le verrou. Un onglet masqué, même longtemps ou avec des timers ralentis, continue
son examen. Aucun heartbeat n’est utilisé pour inférer une fermeture.

## Finalisation, remise anticipée et abandon

Les motifs terminaux canoniques sont distincts :

| Motif | Déclencheur | Bilan |
| --- | --- | --- |
| `time_expired` | Échéance originale atteinte | Oui, fin fixée à `endsAt` |
| `completed` | Chaque exercice a au moins une validation réussie acceptée | Oui |
| `submitted_early` | « Terminer l'examen » confirmé avant l’échéance | Oui |
| `interruption_timeout` | Interruption détectée dépassant cinq minutes | Oui, à la limite de reprise |
| `abandoned` | Back reconnu ou sortie confirmée d’une session active | Non, brouillons invalidés |

`finishTrueExamSession()` est idempotente : la première transition ferme l’acceptation
des évaluations, arrête l’intervalle et fixe `completedAt` avant d’afficher le bilan.
Une réponse tardive ne peut plus modifier ces statistiques. Un onglet ralenti qui
se réveille après l’échéance indique trois heures utilisées, pas son retard de réveil.
Une confirmation de remise acceptée après l’échéance produit `time_expired`.

L’action compacte « Terminer l'examen » est dans l’en-tête pendant la session.
Sa confirmation explique que la remise est définitive, que les exercices non
réussis restent incomplets et qu’un bilan sera produit. Annuler conserve la session.
Cette remise ne devient jamais `abandoned`. Une session terminée ne peut pas être
reclassée par une sortie, un Back ou un retour dans le cache.

### Évaluations et catégories

Le navigateur capture l’UUID/objet de session et l’ID d’exercice lors de l’envoi.
Seules les réponses HTTP réussies avec un JSON contenant `success` booléen,
reçues pendant cette même session active avant sa fin, sont acceptées. Une erreur
réseau/HTTP, un JSON invalide ou une réponse tardive ne crée pas de tentative.

Chaque réponse acceptée incrémente `results[id].attempts` ; `success` reste vrai
dès la première réussite. Les catégories sont exclusives : réussi si `success`,
non réussi si `attempts > 0` sans réussite, non tenté si `attempts === 0`.
Leur somme égale toujours le nombre d’exercices sélectionnés. Tous réussis termine
l’examen ; aucune progression automatique entre exercices n’est ajoutée.

### Persistance du bilan

La clé `z01exam-true-exam-report` conserve le **dernier bilan**, schéma v1 :

- `id`, `track`, `exerciseIds` ;
- `results` ordonnés : `id`, `title`, `level`, `attempts`, `success` ;
- `startedAt`, `completedAt`, `endsAt`, `reason` ;
- `summary` : réussis, non réussis, non tentés, soumissions, `usedMs`, `durationMs`.

Le bilan est écrit avant le marqueur terminal de session. Il ne contient aucun
brouillon. Sa validation contrôle IDs, timestamps, compteurs, motif et statistiques
recalculées. Les erreurs de stockage ne cassent pas le bilan en mémoire ; un
avertissement est visible sur l’écran de résultats si sa persistance est incertaine.
Il s’agit de stockage local à ce navigateur, sans synchronisation entre appareils.
Un nouvel examen terminé remplace ce dernier bilan : aucun historique de compte
ou archivage multi-examens n’est fourni.

### Interface terminale et actions

Le bilan remplace tout l’espace de travail : en-tête de programmation, énoncé,
barre latérale, éditeur, console et chronomètre sont masqués. L’éditeur est aussi
désactivé et vidé. L’écran affiche le résumé, les statistiques et une table par
exercice. Les titres et autres valeurs dynamiques utilisent exclusivement
`textContent` et des nœuds DOM, jamais du HTML injecté.

« Nouvel examen » efface le pointeur actif et revient à la préparation, sans
minuteur ni tirage. Le prochain Start crée un UUID, des brouillons et des résultats
vierges. « Quitter » revient au mode Exam sans confirmation d’abandon. Ces deux
actions conservent le dernier bilan indépendant mais empêchent son réaffichage
automatique après F5 sur la préparation ou le mode Exam.

L’abandon actif, lui, conserve uniquement un marqueur `abandoned` et efface aussi
la mémoire et le code. Aucune fenêtre de reprise ne l’annule. Si l’écriture échoue,
une suppression de la clé active est tentée. Le code de navigation historique
conserve sa politique d’abandon, indépendamment du chemin de finalisation.

## Back/Forward : entrée contrôlée et cache de navigation

L’ancienne stratégie ne reconnaissait Back que si la Navigation API donnait la
direction et un index de destination. Un départ entre documents non identifié
était enregistré par `pagehide` comme interruption ; Forward pouvait donc
reprendre cet examen. `popstate` seul, sans entrée contrôlée, n’aurait pas corrigé
ce départ : il est émis sur l’entrée de destination.

Au démarrage et à la reprise d’un examen, `armTrueExamHistoryGuard()` marque
l’entrée courante comme `base` par `replaceState`, puis ajoute une seule entrée
`exam` par `pushState`, à la même URL. Les marqueurs sont dans
`history.state.z01examTrueExam` et ne contiennent que `guardId`, `sessionId` et
`kind` : aucun brouillon ou énoncé. Les autres propriétés de l’état sont conservées.

Un Back ordinaire depuis cette entrée atteint la base dans le même document,
y compris sans Navigation API. Son `popstate` :

1. Consomme le garde avant tout nouvel événement.
2. Invalide l’UUID et efface brouillons, progression, code et minuteur.
3. Appelle **une seule fois** `history.back()` pour atteindre la page précédant
   l’application. L’utilisateur ne doit pas cliquer Back une seconde fois.

Un F5 ou une fermeture ne traverse pas cette paire : la sauvegarde complète et
l’échéance restent récupérables. F5 réutilise le marqueur déjà présent sans
ajouter d’entrée. Les nouveaux examens réutilisent la paire existante, avec un
UUID neuf. Un Back pendant le chargement de restauration peut aussi invalider
la sauvegarde de cet onglet avant qu’elle soit appliquée.

La Navigation API reste un complément pour les sauts arrière connus qui passent
au-delà du garde. Elle ne bloque et n’intercepte jamais la navigation. Un événement
annulé, un index inconnu ou `pagehide` seul ne démontre pas un abandon.

Forward peut repasser par la base puis l’ancienne entrée `exam` : cela n’active
rien et ne déclenche aucun retour automatique. La marque d’abandon ne contient
plus de code. Lors d’un `pageshow.persisted`, toute reprise relit la sauvegarde
et vérifie l’UUID attendu : un abandon, une absence de snapshot ou un UUID de
remplacement conserve l’éditeur vide. `autocomplete="off"` évite aussi la
restauration native de l’ancienne valeur du formulaire.

### Compromis et limites

- La paire ajoute une entrée visible dans la liste d’historique. Forward peut
  montrer deux entrées de l’application sans examen actif ; aucun Forward
  automatique n’est ajouté pour les masquer, afin d’éviter les boucles.
- Sans page antérieure (application ouverte comme première entrée), il n’existe
  aucune destination à quitter par Back ; l’examen est néanmoins abandonné.
- Le chemin classique History API n’utilise pas d’API propriétaire. Il a été
  vérifié dans Firefox 156 en mode sans interface, avec Navigation API activée
  puis désactivée, y compris un retour Forward du même document depuis le cache.
  Cela ne constitue pas une validation de toutes les versions de Firefox.
- Si `pushState`/`replaceState` est refusé ou si le navigateur supprime/saute les
  entrées scriptées ou ne délivre pas `popstate`, le garde ne garantit pas
  l’abandon. Une erreur d’installation affiche explicitement cette limite dans
  la console de l’application. Le navigateur peut également sauter plusieurs
  entrées via un appui long sur Back : sans direction observable par Navigation
  API, un tel saut qui contourne la base reste ambigu et suit la reprise normale.
- Des entrées ajoutées par un autre script ou une navigation de fragments peuvent
  modifier le parcours de l’historique ; le garde couvre la paire installée par
  l’application, sans imposer une boucle de rattrapage générale.

Références : [ordre de `popstate`](https://developer.mozilla.org/en-US/docs/Web/API/Window/popstate_event),
[`pushState`](https://developer.mozilla.org/en-US/docs/Web/API/History/pushState),
[`go` et traversées asynchrones](https://developer.mozilla.org/en-US/docs/Web/API/History/go).

## Plusieurs onglets et limites

Web Locks, lorsqu’il est disponible, fournit un verrou exclusif gardé jusqu’à
`pagehide` ou la sortie explicite. Un autre onglet ne peut ni reprendre ni remplacer
l’examen actif. Le verrou n’est pas libéré quand l’onglet est simplement masqué.
Sans Web Locks, la vérification du propriétaire enregistré et les événements
`storage` protègent les écritures et les évaluations ; ce repli n’est pas atomique.
Un onglet dupliqué peut partager son identifiant de session et une ouverture
simultanée reste ambiguë. Le document qui perd la propriété arrête son minuteur
et ses évaluations, sans écraser l’autre snapshot.

Les API navigateur ne distinguent pas parfaitement fermeture, crash et restauration :

- Sans `pagehide` (certains crashes/arrêts mobiles), l’instant de fermeture est
  inconnu. Si Web Locks permet de reprendre, seule l’échéance originale s’applique ;
  les cinq minutes ne peuvent pas être prouvées. Sans ce verrou, un propriétaire
  inconnu non libéré est refusé par prudence.
- Un onglet fermé puis restauré peut être annoncé comme `reload` avec le même
  `sessionStorage`, ce qui le rend indistinguable d’un F5.
- Un crash avant la sauvegarde différée peut perdre les dernières frappes.
- Stockage refusé/effacé/saturé ou horloge locale modifiée : aucune garantie de
  reprise ou de contrôle serveur. La protection entre onglets est dégradée si
  les accès au stockage échouent ; un abandon peut aussi devenir impossible à
  mémoriser durablement si écriture et suppression sont toutes deux refusées.

Références : [pagehide](https://developer.mozilla.org/en-US/docs/Web/API/Window/pagehide_event),
[type de navigation](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceNavigationTiming/type),
[Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API).

## Vérifications

`node --test tests/true-exam-timer.test.cjs` utilise des horloges, stockages,
événements et verrous simulés, sans dépendance ajoutée. Les tests unitaires ne valident pas un
navigateur réel. La progression automatique, les comptes et le stockage serveur
restent hors périmètre.

Un scénario optionnel reproductible dans Firefox réel est fourni dans
`tests/firefox-history-check.cjs` (WebDriver standard, aucun paquet npm ajouté).
Démarrer `make start` et `geckodriver --port 4444`, puis :

```sh
node tests/firefox-history-check.cjs
DISABLE_NAVIGATION_API=1 node tests/firefox-history-check.cjs
```

`Z01EXAM_URL` et `GECKODRIVER_URL` permettent de choisir d’autres ports. Le scénario
vérifie F5, un seul Back, Forward, un nouvel UUID sans code hérité et une nouvelle
navigation vers l’application. Il vérifie aussi la confirmation réelle de remise,
le remplacement plein écran, F5 sur le bilan, Nouvel examen et Quitter. Un marqueur DOM distingue un document réellement
rendu depuis le cache d’un document rechargé ; le résultat est affiché. Lors des
vérifications Firefox 156 effectuées pour cette correction, ce marqueur a confirmé
le retour du même document. Les deux chemins ont passé ces contrôles.

Vérifications manuelles à effectuer dans chaque navigateur visé :

1. Démarrer avec chaque langage, écrire du code puis F5 : mêmes IDs, code et délai.
2. Masquer vingt minutes : compteur continu, aucune restriction de reprise.
3. Fermer puis rouvrir après trois/six minutes : reprise/refus si départ détecté.
4. Depuis une autre page, ouvrir l’application, démarrer puis cliquer une seule
   fois Back : abandon et retour à cette page. Forward, puis une nouvelle
   navigation vers Z01EXAM, ne doivent restaurer ni l’ancien UUID ni son code.
   Répéter dans Firefox, avec une page précédente d’une autre origine et avec
   le cache de navigation actif.
5. Recharger plusieurs fois et démarrer plusieurs examens : vérifier que les
   gardes ne s’accumulent pas et qu’aucune boucle Back/Forward n’apparaît.
6. Abandonner, démarrer un nouvel examen, puis revenir à un ancien document du
   cache : aucun ancien code, aucune reprise d’un UUID différent.
7. Ouvrir un second onglet : aucune écriture concurrente ; revenir au premier.
8. Annuler puis confirmer une sortie, puis recharger : conservation puis abandon.
9. Dans un profil de test, rendre les données invalides ou le stockage indisponible :
   message clair, aucun examen de remplacement automatique, aucune soumission interdite.

Pour les résultats, vérifier aussi les fins `time_expired` et `interruption_timeout`
avec une horloge contrôlée dans un profil de test, une remise annulée/confirmée,
les statistiques d’exercices réussis/non réussis/non tentés, et la lisibilité du
tableau sur petit écran. Les tests Node simulent ces évaluations sans appeler le
runner ; les vérifications Firefox du bilan utilisent une remise sans soumission.

# Minuteur True Exam — phase 1 du ticket #8

Le minuteur est limité à l’interface. Le cycle de vie est explicite :

- `ready` : préparation, choix du langage, durée et règle de progression ; aucune
  série ni session chronométrée n’est créée. La préparation occupe la zone de
  l’énoncé avec un bouton principal visible en haut. Run et l’éditeur sont désactivés.
- `running` : le bouton « Commencer l'examen » génère une série valide,
  sélectionne le premier exercice puis démarre les 10 800 secondes. Les appels
  répétés ne remplacent pas la session. Le langage est verrouillé dans
  `trueExamSession.track` ; le compteur unique remplace son sélecteur dans l’en-tête.
- `finished` : expiration ou abandon. L’intervalle est arrêté et les soumissions
  sont bloquées tant que l’utilisateur reste dans True Exam.

La disponibilité des catalogues conditionne le bouton de démarrage. La fin du
chargement et les changements de langage pendant la préparation ne démarrent
jamais d’examen. Les exercices JS fictifs ne permettent pas de démarrer.
Après expiration, le compteur masqué contient `00:00:00` et un message de fin
reste visible dans la zone de l’énoncé. Changer de langage prépare alors un nouvel examen ;
quitter puis revenir dans True Exam rétablit également la préparation.

`trueExamSession` contient `startedAt`, `endsAt` (millisecondes Unix), `track` et
`expired`. `refreshTrueExamTimer()` calcule le temps restant à partir de
`Date.now()`, sans compteur décrémenté. Un seul intervalle rafraîchit l’affichage,
également actualisé sur `visibilitychange` et avant une évaluation ou son résultat.
L’expiration est idempotente. Les résultats et erreurs d’une session abandonnée,
remplacée ou expirée sont ignorés. Les requêtes déjà parties ne sont pas annulées
côté serveur.

Quitter un examen actif pour Exam ou Learning demande confirmation. Une annulation
restaure le sélecteur de mode et conserve la session, sa série et son échéance.
Les fonctions next/restart sont conservées pour le futur mode d’entraînement,
mais leurs boutons sont masqués et les appels sont bloqués pendant l’examen.
Les clics sur d’autres exercices sont également bloqués. Une validation réussie
reste sur l’exercice courant : la progression automatique est une étape ultérieure.

Pendant l’examen, aucun panneau d’information ne précède l’énoncé : seule une
progression compacte « Exercice 01 / 10 » est affichée au-dessus de celui-ci.
Le minuteur reste exclusivement dans l’en-tête.

## Intégration ultérieure de la reprise

`startTrueExamTimer(startedAt, endsAt)` accepte les timestamps d’origine et
expire immédiatement si l’échéance est passée. Avant de l’appeler, la reprise
devra restaurer la série complète, le parcours, l’exercice courant, le code,
les résultats et les tentatives. Ne jamais recalculer l’échéance lors d’une reprise.
`resetTrueExamTimer()` invalide aussi l’identité de session utilisée pour filtrer
les réponses asynchrones ; `stopTrueExamTimer()` ne fait qu’arrêter l’intervalle.

Aucune persistance, fenêtre de reprise de cinq minutes ou bilan n’est implémenté.
La politique de reprise devra être ajoutée séparément et ne pourra pas déduire
fiablement la cause d’une fermeture du navigateur. L’horloge locale peut être
modifiée par l’utilisateur : cette phase ne fournit pas de contrôle serveur.

## Vérification automatisée

`node --test tests/true-exam-timer.test.cjs` exécute les fonctions du frontend
dans un contexte VM avec horloge et intervalles contrôlés, sans dépendance.
Les tests couvrent aussi la préparation, la disponibilité des catalogues, les
quatre langages, la confirmation de sortie et les gardes de navigation. Les
fonctions de rendu secondaires sont simulées : ces tests ne remplacent pas une
vérification visuelle dans un navigateur, notamment sur petit écran et au clavier.

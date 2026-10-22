# Contribuer à Z01EXAM

Bienvenue ! Ce guide suppose que tu débutes : Zie, le bot du Discord, te
guide à chaque étape.

## Ce qu'il te faut

- Un compte GitHub avec la **double authentification** activée
  ([Settings → Password and authentication](https://github.com/settings/security))
  et ton **e-mail privé** (*Keep my email addresses private* et *Block command
  line pushes that expose my email* dans [Settings → Emails](https://github.com/settings/emails)).
- Git, un éditeur (VS Code ou WebStorm), Go 1.22 ou plus et Docker pour lancer
  le site en local (voir le README).
- Le rôle **Contributor** sur le [Discord](https://discord.gg/cP2Dn5DF6H) :
  postule dans `#devenir-contributor`, puis tape `/lier` pour relier ton compte
  GitHub.

## Le parcours

Tout se passe sur Discord, avec Zie. Ne crée ni branche ni assignation à la
main sur GitHub : Zie s'en charge.

1. **Choisir** : dans `#tickets`, clique sur **Proposer** sous un ticket.
   Tu entres dans le salon du ticket : sa description est en haut. Le ticket
   est alors **💬 En discussion** : on décide ensemble de ce qu'on va coder
   et de la façon de le faire.
2. **Proposer** : explique dans le salon ce que tu as compris, ce que tu veux
   faire et pourquoi, discutes-en avec les autres, puis clique sur
   **🔔 Appeler le Maintainer**.
3. **Coder** : une fois l'équipe validée, le ticket passe **🔵 En cours** :
   Zie t'assigne et crée la branche. Les commandes git sont dans la carte en
   haut du salon. Teste avec `make start` et `go test ./...` dans `backend/`.
   Sur un ticket déjà en cours, clique sur **Rejoindre** : tu entres dans
   l'équipe tout de suite, tant qu'elle compte moins de 4 personnes.
4. **Demander la relecture** : quand c'est prêt, clique sur
   **📬 Demander la relecture** dans la carte : la PR s'ouvre avec
   `Closes #42`. Si la CI est rouge ou si on te demande des changements, Zie te
   prévient dans le salon.
5. **Terminé** : le mainteneur fusionne, tu reçois un message privé et le
   salon se ferme.

Tu peux quitter un ticket à tout moment avec le bouton **🚪 Quitter**. 3
tickets au plus par personne, 4 personnes au plus par ticket.

## Les étiquettes des tickets

- 🌱 `good first issue` : idéal pour débuter.
- 🏗️ `gros chantier` : il faut au moins deux personnes pour le lancer.
- 💬 `à discuter` : une décision d'architecture ou de produit est à trancher
  dans le salon avant de coder.
- `à valider` : proposition pas encore validée, on ne la prend pas.

Chaque ticket décrit ce qui est attendu : contexte, spec fonctionnelle, spec
code et « c'est fini quand ». Si quelque chose n'est pas clair, demande dans
le salon avant de coder.

## Les règles

- On ne pousse jamais directement sur `main` : tout passe par une PR.
- Une PR = un seul sujet, testé.
- Toute PR est relue et approuvée par le mainteneur avant d'être fusionnée.
- Chaque fusion sur `main` est mise en ligne automatiquement : la relecture compte.
- Un ticket pris sans nouvelles pendant deux semaines peut être réattribué.
- Tout le monde respecte le [code de conduite](CODE_OF_CONDUCT.md).

## Où modifier quoi

| Je veux changer… | Je regarde… |
| --- | --- |
| L'interface | `index.html`, `app.js`, `style.css` |
| Un énoncé JS | `Js_exam_instructions/` |
| Une leçon du mode Learning | `learning-content/` |
| Les tests et la moulinette | `backend/runner*.go`, `backend/rust.go`, `backend/java.go` |

Les rôles de chaque brique sont décrits dans
[docs/architecture-services.md](docs/architecture-services.md).

## Une question ?

Passe sur le [Discord de la communauté](https://discord.gg/cP2Dn5DF6H).

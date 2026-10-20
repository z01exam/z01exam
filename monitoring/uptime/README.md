# Surveillance de z01exam.online

Worker Cloudflare (offre gratuite) qui surveille le site depuis l'extérieur du
VPS : si le serveur tombe, l'alerte part quand même.

- **Toutes les minutes** : `GET /api/version` doit répondre.
- **Toutes les 5 minutes** : une vraie correction Go (`POST /api/run`, exercice
  `onlya`) doit réussir, ce qui vérifie aussi Docker et les moulinettes.
- **Après 2 échecs de suite** : alerte sur chaque canal configuré.
- **Au retour** : message « rétabli » avec la durée de la panne.

L'état (échecs consécutifs, alerte envoyée) est gardé dans un espace KV
(`npx wrangler kv key get state --binding STATE --remote`). Le Worker n'a pas
d'adresse publique.

## Canaux

Chaque canal est activé par ses secrets ; un secret absent le désactive.

| Canal | Secrets |
| --- | --- |
| Discord | `DISCORD_WEBHOOK_URL`, `DISCORD_USER_ID` (mention, facultatif) |
| E-mail ([Resend](https://resend.com), gratuit) | `RESEND_API_KEY`, `ALERT_EMAIL` (l'adresse du compte Resend) |
| SMS (Free Mobile, gratuit pour les abonnés) | `FREE_SMS_USER`, `FREE_SMS_PASS` |

Les secrets ne vont jamais dans le dépôt : `npx wrangler secret put NOM`
les demande de manière masquée.

## Installer

Depuis ce dossier, avec un compte Cloudflare :

```sh
npx wrangler login
npx wrangler kv namespace create STATE   # reporter l'id dans wrangler.toml
npx wrangler deploy
npx wrangler secret put DISCORD_WEBHOOK_URL   # etc. pour chaque secret
```

- Webhook Discord : Zie crée le salon privé et le webhook, dont l'URL passe
  directement dans le secret sans s'afficher (depuis le dépôt du bot) :

  ```sh
  go run ./cmd/admin create-channel --private alertes
  go run ./cmd/admin create-webhook alertes "Surveillance z01exam" \
    | (cd <ce dossier> && npx wrangler secret put DISCORD_WEBHOOK_URL)
  ```
- SMS Free Mobile : espace abonné → Mes options → « Notifications par SMS »
  (activer) ; l'identifiant et la clé s'y affichent.

## Tester une alerte

Simuler une panne en visant une adresse qui ne répond pas, avec les vrais
secrets :

```sh
npx wrangler dev --remote --test-scheduled --var TARGET_URL:https://z01exam.online/inexistant
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"   # 1er échec
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"   # 2e : alerte
```

L'espace KV de `wrangler dev --remote` est celui de prévisualisation : la
simulation ne touche pas l'état de production.

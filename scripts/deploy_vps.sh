#!/usr/bin/env bash
# Transactional deployment for the systemd monolith. Run it as the service user.
set -Eeuo pipefail
umask 077

SERVICE_NAME="${SERVICE_NAME:-z02intra.service}"
APP_DIR="${APP_DIR:?APP_DIR requis (exporté par le wrapper du VPS)}"
DEPLOY_RUNTIME_DIR="${DEPLOY_RUNTIME_DIR:?DEPLOY_RUNTIME_DIR requis (exporté par le wrapper du VPS)}"
EXPECTED_SHA="${1:-${EXPECTED_SHA:-}}"
PREVIEW_ADDR="${PREVIEW_ADDR:-127.0.0.1:8088}"
REQ_TIMEOUT="${REQ_TIMEOUT:-75}"
HEALTH_ATTEMPTS="${HEALTH_ATTEMPTS:-60}"
OFFICIAL_GO_RUNNER_IMAGE="ghcr.io/01-edu/test-go@sha256:9c57c88e68f8937617a26d805396c775d5a88f43e214b91386986f89a9df13bf"

log() { printf '[deploy] %s\n' "$*"; }
die() { printf '[deploy] erreur: %s\n' "$*" >&2; exit 1; }

[[ "${EUID}" -ne 0 ]] || die "exécuter avec l'utilisateur du service, jamais root"
[[ "$EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]] || die "SHA Git complet requis (argument 1 ou EXPECTED_SHA)"
[[ -e "$APP_DIR/.git" ]] || die "dépôt introuvable: $APP_DIR"
for cmd in git curl docker systemctl tar flock ss python3; do command -v "$cmd" >/dev/null || die "$cmd est requis"; done
# Pin the supported compiler and do not silently accept an older PATH binary.
if [[ -z "${GO_BIN:-}" ]]; then
  GO_BIN="$(command -v go || true)"
  if [[ -x /usr/local/go/bin/go ]] && ! GOTOOLCHAIN=local "$GO_BIN" version 2>/dev/null | grep -Eq 'go1\.(27\.([3-9]|[1-9][0-9]+)|2[89]\.|[3-9][0-9]\.)'; then
    GO_BIN=/usr/local/go/bin/go
  fi
fi
[[ -x "$GO_BIN" ]] || die "Go est requis"
GOTOOLCHAIN=local "$GO_BIN" version | grep -Eq 'go1\.(27\.([3-9]|[1-9][0-9]+)|2[89]\.|[3-9][0-9]\.)' || die "Go 1.27.3 ou plus récent est requis"
[[ "$PREVIEW_ADDR" =~ ^127\.0\.0\.1:([0-9]+)$ ]] || die "PREVIEW_ADDR doit être une adresse loopback 127.0.0.1:port"
[[ "${BASH_REMATCH[1]}" -gt 0 && "${BASH_REMATCH[1]}" -lt 65536 ]] || die "port de préflight invalide"

cd "$APP_DIR"
APP_DIR="$(pwd -P)"
mkdir -p "$DEPLOY_RUNTIME_DIR"
DEPLOY_RUNTIME_DIR="$(cd "$DEPLOY_RUNTIME_DIR" && pwd -P)"
case "$DEPLOY_RUNTIME_DIR/" in "$APP_DIR/"*) die "DEPLOY_RUNTIME_DIR ne doit pas être servi depuis APP_DIR";; esac
exec 9>"$DEPLOY_RUNTIME_DIR/deploy.lock"
flock -n 9 || die "un déploiement est déjà en cours"
# Capture rollback state only after acquiring the shared deployment lock.
git diff --quiet || die "le checkout contient des modifications suivies"
git diff --cached --quiet || die "le checkout contient des modifications indexées"
PREVIOUS_SHA="$(git rev-parse --verify HEAD)"

log "vérification du commit immuable sur origin/main"
git fetch --quiet origin main
[[ "$(git rev-parse origin/main)" == "$EXPECTED_SHA" ]] || die "le SHA demandé n'est pas exactement origin/main"
git cat-file -e "$EXPECTED_SHA^{commit}" || die "commit demandé introuvable"
# Refuse a checkout that would overwrite a local, untracked server file.
while IFS= read -r target_path; do
  if [[ -e "$target_path" ]] && ! git ls-files --error-unmatch -- "$target_path" >/dev/null 2>&1; then
    die "collision avec un fichier non suivi du serveur: $target_path"
  fi
done < <(git ls-tree -r --name-only "$EXPECTED_SHA")

mkdir -p "$DEPLOY_RUNTIME_DIR/transactions" "$DEPLOY_RUNTIME_DIR/cache" "$DEPLOY_RUNTIME_DIR/tmp" "$DEPLOY_RUNTIME_DIR/gopath"
TRANSACTION_DIR="$(mktemp -d "$DEPLOY_RUNTIME_DIR/transactions/${EXPECTED_SHA:0:12}.XXXXXX")"
RELEASE_DIR="$TRANSACTION_DIR/source"
CANDIDATE_BIN="$TRANSACTION_DIR/server.candidate"
SOURCE_BACKUP="$TRANSACTION_DIR/previous-source.tar"
PREVIOUS_BIN_BACKUP="$TRANSACTION_DIR/server.previous"
PREVIOUS_SHA_BACKUP="$TRANSACTION_DIR/previous-sha"
TARGET_BIN="$APP_DIR/server"
[[ -x "$TARGET_BIN" ]] || die "binaire de production absent ou non exécutable: $TARGET_BIN"
CANDIDATE_PID=""
SWITCH_STARTED=0
STAGED_BIN=""
cleanup_candidate() {
  if [[ -n "$CANDIDATE_PID" ]]; then
    kill "$CANDIDATE_PID" >/dev/null 2>&1 || true
    wait "$CANDIDATE_PID" 2>/dev/null || true
    CANDIDATE_PID=""
  fi
}
finish() {
  local status=$?
  trap - EXIT INT TERM
  cleanup_candidate
  if [[ "$SWITCH_STARTED" == 1 ]]; then
    if rollback; then
      log "restauration validée"
    else
      log "RESTAURATION ÉCHOUÉE : intervention requise; sauvegarde $TRANSACTION_DIR"
    fi
    status=1
  fi
  [[ -z "$STAGED_BIN" ]] || rm -f -- "$STAGED_BIN"
  exit "$status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Nothing in the active checkout or service has changed before this point.
git archive --format=tar "$PREVIOUS_SHA" >"$SOURCE_BACKUP"
printf '%s\n' "$PREVIOUS_SHA" >"$PREVIOUS_SHA_BACKUP"
mkdir "$RELEASE_DIR"
git archive "$EXPECTED_SHA" | tar -x -C "$RELEASE_DIR"

read_service_env() {
  local raw token key value
  raw="$(systemctl show "$SERVICE_NAME" -p Environment --value)"
  SERVICE_ENV=()
  # Do not eval systemd output. Whitespace values are rejected rather than parsed.
  for token in $raw; do
    token="${token#\"}"; token="${token%\"}"
    [[ "$token" == *=* ]] || continue
    key="${token%%=*}"; value="${token#*=}"
    [[ "$key" =~ ^(RUNNER_MODE|RUNNER_GO_DOCKER_IMAGE|RUNNER_JS_DOCKER_IMAGE|RUNNER_(PIDS_LIMIT|MEMORY|CPUS|TIMEOUT|TIMEOUT_SECONDS|WORK_DIR|MAX_ACTIVE|MAX_QUEUE|QUEUE_WAIT_SECONDS)|RUN_TIMEOUT|DOCKER_HOST|DOCKER_TIMEOUT)$ ]] || continue
    [[ "$value" != *[[:space:]]* ]] || die "valeur systemd non sûre pour $key"
    SERVICE_ENV+=("$key=$value")
  done
}

read_service_env
DOCKER_HOST_VALUE=""
RUNNER_IMAGE="$OFFICIAL_GO_RUNNER_IMAGE"
for pair in "${SERVICE_ENV[@]}"; do
  case "$pair" in
    DOCKER_HOST=*) DOCKER_HOST_VALUE="${pair#*=}" ;;
    RUNNER_GO_DOCKER_IMAGE=*) RUNNER_IMAGE="${pair#*=}" ;;
  esac
done
[[ -n "$DOCKER_HOST_VALUE" ]] || die "DOCKER_HOST doit être défini explicitement dans $SERVICE_NAME"
[[ " ${SERVICE_ENV[*]} " == *" RUNNER_MODE=docker "* ]] || die "RUNNER_MODE doit être docker dans le service"
systemctl is-active --quiet "$SERVICE_NAME" || die "service initial inactif"
env -u DOCKER_CONTEXT "DOCKER_HOST=$DOCKER_HOST_VALUE" docker info >/dev/null || die "Docker rootless inaccessible"
SECURITY_OPTIONS="$(env -u DOCKER_CONTEXT "DOCKER_HOST=$DOCKER_HOST_VALUE" docker info --format '{{json .SecurityOptions}}')"
[[ "$SECURITY_OPTIONS" == *rootless* ]] || die "le daemon Docker ciblé n'est pas rootless"
env -u DOCKER_CONTEXT "DOCKER_HOST=$DOCKER_HOST_VALUE" docker image inspect "$RUNNER_IMAGE" >/dev/null || die "image officielle runner absente: $RUNNER_IMAGE"

log "construction candidate monolith dans une release isolée"
(
  cd "$RELEASE_DIR/backend"
  GOTOOLCHAIN=local TMPDIR="$DEPLOY_RUNTIME_DIR/tmp" GOCACHE="$DEPLOY_RUNTIME_DIR/cache" GOTMPDIR="$DEPLOY_RUNTIME_DIR/tmp" GOPATH="$DEPLOY_RUNTIME_DIR/gopath" "$GO_BIN" build -ldflags "-X Z02INTRA.BuildSHA=$EXPECTED_SHA" -o "$CANDIDATE_BIN" ./cmd/monolith
)
[[ -x "$CANDIDATE_BIN" ]] || die "binaire candidat non exécutable"

smoke_candidate() {
  local response track payload ready=0 preview_port
  preview_port="${PREVIEW_ADDR##*:}"
  [[ "$preview_port" =~ ^[0-9]+$ ]] || return 1
  [[ "$(ss -ltn "sport = :$preview_port")" != *":$preview_port"* ]] || return 1
  (
    cd "$RELEASE_DIR"
    exec env -i HOME="$HOME" PATH="$PATH" TMPDIR="$DEPLOY_RUNTIME_DIR/tmp" "${SERVICE_ENV[@]}" LISTEN_ADDR="$PREVIEW_ADDR" "$CANDIDATE_BIN"
  ) >"$TRANSACTION_DIR/candidate.log" 2>&1 &
  CANDIDATE_PID=$!
  for _ in $(seq 1 30); do
    kill -0 "$CANDIDATE_PID" 2>/dev/null || return 1
    if curl --fail --silent --show-error --max-time 2 "http://$PREVIEW_ADDR/api/exercises?track=go" >/dev/null 2>&1 && kill -0 "$CANDIDATE_PID" 2>/dev/null; then ready=1; break; fi
    sleep 1
  done
  [[ "$ready" == 1 ]] || return 1
  for track in go js rust java; do
    response="$(curl --fail --silent --show-error --max-time "$REQ_TIMEOUT" "http://$PREVIEW_ADDR/api/exercises?track=$track")" || return 1
    python3 -c 'import json,sys; value=json.load(sys.stdin); sys.exit(0 if isinstance(value,list) and value else 1)' <<<"$response" || return 1
  done
  payload='{"exerciseId":"onlya","code":"package main\n\nimport \"fmt\"\n\nfunc main() { fmt.Print(\"a\") }\n"}'
  response="$(curl --fail --silent --show-error --max-time "$REQ_TIMEOUT" -H 'Content-Type: application/json' --data "$payload" "http://$PREVIEW_ADDR/api/run")" || return 1
  [[ "$response" == *'"success":true'* ]] || return 1
  kill -0 "$CANDIDATE_PID" 2>/dev/null
}

log "préflight local non exposé"
smoke_candidate || die "préflight candidat échoué; production intacte"
cleanup_candidate

wait_for_health() {
  local attempts=0
  until curl --fail --silent --show-error --max-time 2 http://127.0.0.1:8080/api/exercises >/dev/null 2>&1; do
    systemctl is-active --quiet "$SERVICE_NAME" || return 1
    attempts=$((attempts + 1))
    [[ "$attempts" -lt "$HEALTH_ATTEMPTS" ]] || return 1
    sleep 1
  done
}

rollback() {
  log "rollback vers $PREVIOUS_SHA"
  sudo systemctl stop "$SERVICE_NAME" || return 1
  if systemctl is-active --quiet "$SERVICE_NAME"; then return 1; fi
  git checkout --no-overwrite-ignore --detach --quiet "$PREVIOUS_SHA" || return 1
  if [[ -f "$PREVIOUS_BIN_BACKUP" ]]; then
    STAGED_BIN="$(mktemp "$APP_DIR/.server-rollback.XXXXXX")" || return 1
    cp -p "$PREVIOUS_BIN_BACKUP" "$STAGED_BIN" || return 1
    mv -f "$STAGED_BIN" "$TARGET_BIN" || return 1
    STAGED_BIN=""
  else
    return 1
  fi
  sudo systemctl start "$SERVICE_NAME" || return 1
  [[ "$(git rev-parse --verify HEAD)" == "$PREVIOUS_SHA" ]] || return 1
  cmp -s "$TARGET_BIN" "$PREVIOUS_BIN_BACKUP" || return 1
  systemctl is-active --quiet "$SERVICE_NAME" || return 1
  wait_for_health || return 1
}

log "bascule atomique"
cp -p "$TARGET_BIN" "$PREVIOUS_BIN_BACKUP"
STAGED_BIN="$(mktemp "$APP_DIR/.server-next.XXXXXX")"
cp -p "$CANDIDATE_BIN" "$STAGED_BIN"
SWITCH_STARTED=1
sudo systemctl stop "$SERVICE_NAME"
if systemctl is-active --quiet "$SERVICE_NAME"; then die "service toujours actif après arrêt"; fi
git checkout --no-overwrite-ignore --detach --quiet "$EXPECTED_SHA"
mv -f "$STAGED_BIN" "$TARGET_BIN"
STAGED_BIN=""
sudo systemctl start "$SERVICE_NAME"
systemctl is-active --quiet "$SERVICE_NAME"
wait_for_health

printf '%s\n' "$EXPECTED_SHA" >"$DEPLOY_RUNTIME_DIR/deployed-sha"
log "déploiement terminé: $EXPECTED_SHA"
SWITCH_STARTED=0

#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}" )/.." && pwd)"
SCRIPT="$ROOT/scripts/deploy_vps.sh"
SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
OLD=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
WORK="$(mktemp -d "${TMPDIR:-/tmp}/z02-deploy-test.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
fake_bin() {
  local bin="$1"; mkdir -p "$bin"
  cat >"$bin/git" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$CALL_LOG"
case "$1" in
diff) [[ "${DIRTY:-0}" != 1 ]];;
rev-parse) [[ "$2" == origin/main ]] && { [[ "${WRONG_MAIN:-0}" != 1 ]] && echo "$SHA" || echo "$OLD"; } || cat "$HEAD_FILE";;
fetch|cat-file) :;; ls-tree) printf '%s\n' server backend/tracked.go backend/new-target.go;;
ls-files) [[ "$*" == *server* || "$*" == *tracked.go* ]];;
checkout) printf '%s\n' "${@: -1}" >"$HEAD_FILE";; archive) printf archive;;
esac
EOF
  cat >"$bin/tar" <<'EOF'
#!/usr/bin/env bash
cat >/dev/null; while [[ $# -gt 0 ]]; do [[ "$1" == -C ]] && { mkdir -p "$2/backend/cmd/monolith"; exit; }; shift; done
EOF
  cat >"$bin/go" <<'EOF'
#!/usr/bin/env bash
[[ "${1:-}" != version ]] || { echo "go version go1.27.3 linux/amd64"; exit; }
while [[ $# -gt 0 ]]; do [[ "$1" == -o ]] && { printf '#!/usr/bin/env bash\nexec sleep 60\n' >"$2"; chmod +x "$2"; exit; }; shift; done; exit 1
EOF
  cat >"$bin/systemctl" <<'EOF'
#!/usr/bin/env bash
printf 'systemctl %s\n' "$*" >>"$CALL_LOG"
case "$1" in
show) echo 'RUNNER_MODE=docker DOCKER_HOST=unix:///run/user/1000/docker.sock RUNNER_GO_DOCKER_IMAGE=test-image';;
is-active) [[ "$(cat "$SERVICE_STATE")" == active ]];;
stop) [[ "${STOP_FAIL:-0}" != 1 ]] || exit 1; [[ "${STOP_STAYS_ACTIVE:-0}" == 1 ]] || echo inactive >"$SERVICE_STATE";;
start) if [[ "${START_FAIL_ONCE:-0}" == 1 && ! -e "$START_MARKER" ]]; then : >"$START_MARKER"; exit 1; fi; echo active >"$SERVICE_STATE";;
esac
EOF
  cat >"$bin/docker" <<'EOF'
#!/usr/bin/env bash
case "$*" in *'info --format'*) echo '["rootless"]';; *info*|*'image inspect'*) :;; esac
EOF
  cat >"$bin/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'curl %s\n' "$*" >>"$CALL_LOG"
if [[ "$*" == *'/api/run'* ]]; then
  payload=; while [[ $# -gt 0 ]]; do [[ "$1" == --data ]] && { payload="$2"; break; }; shift; done
  /usr/bin/python3 - "$payload" <<'PY'
import json, sys
d=json.loads(sys.argv[1]); assert d["exerciseId"]=="onlya"
assert d["code"]=='package main\n\nimport "fmt"\n\nfunc main() { fmt.Print("a") }\n'
PY
  echo '{"success":true}'; exit
fi
[[ "${HEALTH_FAIL:-0}" != 1 || "$*" != *127.0.0.1:8080* ]] || exit 22
echo '[{"id":"onlya"}]'
EOF
  cat >"$bin/sudo" <<'EOF'
#!/usr/bin/env bash
exec "$@"
EOF
  cat >"$bin/ss" <<'EOF'
#!/usr/bin/env bash
[[ "${PORT_BUSY:-0}" != 1 ]] || echo 'LISTEN 0 1 127.0.0.1:8088'
EOF
  cat >"$bin/flock" <<'EOF'
#!/usr/bin/env bash
printf 'flock %s\n' "$*" >>"$CALL_LOG"
[[ "${LOCK_BUSY:-0}" != 1 ]]
EOF
  cat >"$bin/python3" <<'EOF'
#!/usr/bin/env bash
exec /usr/bin/python3 "$@"
EOF
  chmod +x "$bin"/*
}
run_case() {
  local name="$1" expected="$2"; shift 2
  local base app runtime bin
  base="$WORK/$name"
  app="$base/app"
  runtime="$base/runtime"
  bin="$base/bin"
  mkdir -p "$app" "$bin"
  printf 'gitdir: preserved-worktree\n' >"$app/.git"
  printf old >"$app/server"; chmod +x "$app/server"
  printf '%s\n' "$OLD" >"$base/head"; echo active >"$base/service"; : >"$base/calls"; fake_bin "$bin"
  set +e
  env PATH="$bin:$PATH" GO_BIN="$bin/go" SHA="$SHA" OLD="$OLD" CALL_LOG="$base/calls" HEAD_FILE="$base/head" SERVICE_STATE="$base/service" START_MARKER="$base/start" APP_DIR="$app" DEPLOY_RUNTIME_DIR="$runtime" HEALTH_ATTEMPTS=2 "$@" "$SCRIPT" "$SHA" >"$base/out" 2>&1
  local rc=$?; set -e; [[ "$rc" == "$expected" ]] || { cat "$base/out"; return 1; }
  CASE_BASE="$base" CASE_APP="$app" CASE_RUNTIME="$runtime"
}
run_case success 0
[[ "$(cat "$CASE_BASE/head")" == "$SHA" && "$(cat "$CASE_APP/server")" != old && "$(cat "$CASE_BASE/service")" == active ]]
grep -Fq 'déploiement terminé' "$CASE_BASE/out"
[[ "$(head -n 1 "$CASE_BASE/calls")" == 'flock -n 9' ]]
run_case preflight_fail 1 PORT_BUSY=1
[[ "$(cat "$CASE_BASE/head")" == "$OLD" && "$(cat "$CASE_BASE/service")" == active ]]
! grep -q 'systemctl stop\|systemctl start\|checkout' "$CASE_BASE/calls"
# A failed preflight must not prevent a second transaction for the same SHA.
base="$CASE_BASE"
env PATH="$base/bin:$PATH" GO_BIN="$base/bin/go" SHA="$SHA" OLD="$OLD" CALL_LOG="$base/calls" HEAD_FILE="$base/head" SERVICE_STATE="$base/service" START_MARKER="$base/start" APP_DIR="$base/app" DEPLOY_RUNTIME_DIR="$base/runtime" HEALTH_ATTEMPTS=2 "$SCRIPT" "$SHA" >"$base/retry.out" 2>&1
[[ "$(cat "$base/head")" == "$SHA" ]]
[[ "$(find "$base/runtime/transactions" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')" == 2 ]]
# The mock must reject the original double-escaped payload, not mask it.
set +e
CALL_LOG="$base/calls" "$base/bin/curl" --data '{"exerciseId":"onlya","code":"package main\\n"}' http://127.0.0.1:8088/api/run >"$base/payload-invalid.out" 2>&1
rc=$?
set -e
[[ "$rc" -ne 0 ]]
run_case rollback_valid 1 START_FAIL_ONCE=1
[[ "$(cat "$CASE_BASE/head")" == "$OLD" && "$(cat "$CASE_APP/server")" == old && "$(cat "$CASE_BASE/service")" == active ]]
grep -Fq 'restauration validée' "$CASE_BASE/out"
run_case stop_stays_active 1 STOP_STAYS_ACTIVE=1
[[ "$(cat "$CASE_BASE/head")" == "$OLD" ]]; ! test -e "$CASE_RUNTIME/deployed-sha"
run_case lock_busy 1 LOCK_BUSY=1
[[ "$(cat "$CASE_BASE/calls")" == 'flock -n 9' ]]
run_case rollback_health_failure 1 HEALTH_FAIL=1
[[ "$(cat "$CASE_BASE/head")" == "$OLD" && "$(cat "$CASE_APP/server")" == old ]]
grep -Fq 'RESTAURATION ÉCHOUÉE' "$CASE_BASE/out"
! grep -Fq 'restauration validée' "$CASE_BASE/out"
run_case dirty_checkout 1 DIRTY=1
[[ "$(cat "$CASE_BASE/head")" == "$OLD" && "$(cat "$CASE_BASE/service")" == active ]]
run_case public_preview_rejected 1 PREVIEW_ADDR=0.0.0.0:8088
[[ ! -s "$CASE_BASE/calls" ]]
base="$WORK/runtime_symlink"; mkdir -p "$base/app/.git" "$base/bin"; printf old >"$base/app/server"; chmod +x "$base/app/server"; : >"$base/calls"; fake_bin "$base/bin"; ln -s "$base/app" "$base/runtime"
set +e
env PATH="$base/bin:$PATH" GO_BIN="$base/bin/go" SHA="$SHA" OLD="$OLD" CALL_LOG="$base/calls" HEAD_FILE="$base/head" SERVICE_STATE="$base/service" APP_DIR="$base/app" DEPLOY_RUNTIME_DIR="$base/runtime" "$SCRIPT" "$SHA" >"$base/out" 2>&1
rc=$?; set -e; [[ "$rc" == 1 ]] && ! grep -q 'rev-parse' "$base/calls"
run_case wrong_main 1 WRONG_MAIN=1
[[ "$(cat "$CASE_BASE/head")" == "$OLD" && "$(cat "$CASE_BASE/service")" == active ]]
base="$WORK/untracked_collision"; mkdir -p "$base/app/.git" "$base/app/backend" "$base/bin"; printf old >"$base/app/server"; chmod +x "$base/app/server"; : >"$base/app/backend/new-target.go"; printf '%s\n' "$OLD" >"$base/head"; echo active >"$base/service"; : >"$base/calls"; fake_bin "$base/bin"
set +e
env PATH="$base/bin:$PATH" GO_BIN="$base/bin/go" SHA="$SHA" OLD="$OLD" CALL_LOG="$base/calls" HEAD_FILE="$base/head" SERVICE_STATE="$base/service" APP_DIR="$base/app" DEPLOY_RUNTIME_DIR="$base/runtime" "$SCRIPT" "$SHA" >"$base/out" 2>&1
rc=$?; set -e; [[ "$rc" == 1 && "$(cat "$base/head")" == "$OLD" && "$(cat "$base/service")" == active ]]
printf 'PASS: stateful deployment, JSON smoke, rollback, lock and rejection contracts\n'

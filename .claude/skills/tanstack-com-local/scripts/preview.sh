#!/usr/bin/env bash
# Resolve tanstack.com, symlink a library worktree into a temp repos dir,
# remember the checkout, print JSON for the agent to start `pnpm dev`.
set -euo pipefail

GROK_HOME="${GROK_HOME:-$HOME/.grok}"
STATE_DIR="$GROK_HOME/tanstack-com-local"
STATE_FILE="$STATE_DIR/state.json"
REPOS_DIR="/tmp/tanstack-local-repos"
CLONE_CMD='git clone git@github.com:TanStack/tanstack.com.git ~/GitHub/tanstack.com'

worktree=""
checkout_pin=""

usage() {
  echo "usage: preview.sh [--worktree DIR] [--checkout DIR]" >&2
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --worktree)
      worktree="${2:-}"
      shift 2
      ;;
    --checkout)
      checkout_pin="${2:-}"
      shift 2
      ;;
    -h | --help) usage ;;
    *) usage ;;
  esac
done

json_escape() {
  python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()[:-1] if False else sys.argv[1]))' "$1"
}

fail() {
  local error="$1"
  local detail="${2:-}"
  printf '{"ok":false,"error":%s,"detail":%s,"cloneCommand":%s}\n' \
    "$(json_escape "$error")" \
    "$(json_escape "$detail")" \
    "$(json_escape "$CLONE_CMD")"
  exit 1
}

is_tanstack_com() {
  local dir="$1"
  [[ -e "$dir/.git" ]] || return 1
  git -C "$dir" remote get-url origin 2>/dev/null | grep -qiE 'github.com[:/]TanStack/tanstack.com(\.git)?$'
}

read_state_checkout() {
  [[ -f "$STATE_FILE" ]] || return 0
  python3 -c 'import json,sys
try:
  print(json.load(open(sys.argv[1])).get("checkout") or "")
except Exception:
  print("")
' "$STATE_FILE"
}

find_checkout() {
  local candidate
  if [[ -n "$checkout_pin" ]]; then
    printf '%s\n' "$checkout_pin"
    return
  fi
  candidate="$(read_state_checkout)"
  if [[ -n "$candidate" ]]; then
    printf '%s\n' "$candidate"
    return
  fi
  for candidate in \
    "$HOME/GitHub/tanstack.com" \
    "$HOME/github/tanstack.com" \
    "$HOME/code/TanStack/tanstack.com" \
    "$HOME/code/tanstack.com" \
    "$HOME/src/tanstack.com" \
    "$HOME/dev/tanstack.com" \
    "$HOME/projects/tanstack.com"
  do
    if is_tanstack_com "$candidate"; then
      printf '%s\n' "$candidate"
      return
    fi
  done
}

repo_from_origin() {
  local url name
  url="$(git -C "$1" remote get-url origin 2>/dev/null || true)"
  [[ -n "$url" ]] || fail "missing-origin" "no origin remote in $1"
  url="${url%.git}"
  url="${url%/}"
  name="${url##*/}"
  [[ -n "$name" && "$name" != "$url" ]] || fail "bad-origin" "$url"
  printf '%s\n' "$name"
}

default_docs_for() {
  case "$1" in
    ai) printf '%s\n' 'getting-started/overview' ;;
    *) printf '%s\n' 'overview' ;;
  esac
}

if [[ -z "$worktree" ]]; then
  worktree="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
fi
worktree="$(cd "$worktree" && pwd)"
[[ -e "$worktree/.git" || -d "$worktree/docs" ]] || fail "bad-worktree" "$worktree"

repo="$(repo_from_origin "$worktree")"
checkout="$(find_checkout || true)"

if [[ -z "$checkout" ]]; then
  fail "missing-checkout" "tanstack.com is not cloned locally. Clone it, then re-run."
fi
checkout="$(cd "$checkout" && pwd)"
is_tanstack_com "$checkout" || fail "not-tanstack-com" "$checkout"

mkdir -p "$STATE_DIR" "$REPOS_DIR"
ln -sfn "$worktree" "$REPOS_DIR/$repo"

if ! git -C "$checkout" pull --ff-only; then
  fail "pull-failed" "git pull --ff-only failed in $checkout"
fi

(cd "$checkout" && pnpm install)

port="${PORT:-3000}"
preview_url="http://localhost:${port}/${repo}/latest/docs/$(default_docs_for "$repo")"
start_command="TANSTACK_LOCAL_REPOS_DIR=$(printf '%q' "$REPOS_DIR") pnpm run with-env -- vite dev --host 127.0.0.1 --port $(printf '%q' "$port")"

python3 - "$STATE_FILE" "$checkout" "$REPOS_DIR" "$repo" "$worktree" "$port" "$preview_url" "$start_command" "$(default_docs_for "$repo")" <<'PY'
import json, sys, datetime
state_file, checkout, repos_dir, repo, worktree, port, preview_url, start_command, default_docs = sys.argv[1:]
state = {
  "checkout": checkout,
  "reposDir": repos_dir,
  "repo": repo,
  "worktree": worktree,
  "updatedAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
}
with open(state_file, "w", encoding="utf-8") as f:
  json.dump(state, f, indent=2)
  f.write("\n")
print(json.dumps({
  "ok": True,
  "checkout": checkout,
  "reposDir": repos_dir,
  "repo": repo,
  "worktree": worktree,
  "port": int(port),
  "previewUrl": preview_url,
  "landingUrl": f"http://localhost:{port}/{repo}/latest",
  "defaultDocs": default_docs,
  "startCommand": start_command,
  "stateFile": state_file,
}, indent=2))
PY

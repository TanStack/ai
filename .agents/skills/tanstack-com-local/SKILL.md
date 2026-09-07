---
name: tanstack-com-local
description: >
  Preview a local TanStack library worktree on tanstack.com. Creates a temp
  folder, symlinks the worktree as the GitHub repo name, remembers the
  tanstack.com checkout, pulls, and prints the command to run pnpm with
  TANSTACK_LOCAL_REPOS_DIR. Use when the user wants to run tanstack.com
  against local docs, preview docs on localhost, alias a worktree into the
  site, set TANSTACK_LOCAL_REPOS_DIR, or runs /tanstack-com-local.
---

# tanstack.com local docs

Copies live at `.claude/skills/tanstack-com-local/`,
`.agents/skills/tanstack-com-local/`, and `.grok/skills/tanstack-com-local/`.
Keep those three identical.

tanstack.com reads library docs from disk in dev. `TANSTACK_LOCAL_REPOS_DIR`
is a directory of repo-named folders (`ai`, `query`, `router`). Do not point
it at `~/GitHub` if that `ai` (or other) symlink belongs to a different
worktree.

State file (checkout path, last repos dir, last worktree):
`$GROK_HOME/tanstack-com-local/state.json` (`GROK_HOME` defaults to `~/.grok`).

## Run

From the library worktree:

```bash
bash .claude/skills/tanstack-com-local/scripts/preview.sh
```

`.agents` and `.grok` copies of the script are identical.

The script prints JSON. Read it.

| `ok` | Action |
|---|---|
| `true` | Remember `checkout`, `reposDir`, and `previewUrl`. Start the site only if the user asked to run or preview it. If they did not, stop after setup. |
| `false`, `error: missing-checkout` | Stop. Show `cloneCommand`. Wait for the user to clone. Do not clone into a guessed path. Re-run the script after they confirm. |
| `false`, other | Stop. Show `error` and `detail`. |

Pass `--worktree <abs>` if cwd is not the library. Pass `--checkout <abs>` to pin the tanstack.com path (saved to state).

Start command shape (script prints the real one):

```bash
TANSTACK_LOCAL_REPOS_DIR=<reposDir> pnpm run with-env -- vite dev --host 127.0.0.1
```

Run it from `checkout`. `with-env` loads `.env.local` but does not override
this variable. Bind `127.0.0.1` so Vite and the Cloudflare workerd child share
IPv4; a default `localhost` bind can land on `[::1]` and hang. Log to
`~/.grok/long-running-background-tasks/tanstack-com-<pid>.log`.

Do not start `pnpm` / `vite` unless the user asked to run or preview the site.

If they did ask, and port 3000 is already this site with the same `reposDir`,
reuse it. If it is something else, use `PORT=3001` (or the next free port)
instead of killing the other process.

Docs need a manual reload in the browser.

## After it is up

Default pages:

- library landing: `http://localhost:<port>/<repo>/latest`
- docs: `http://localhost:<port>/<repo>/latest/docs/<defaultDocs>`

`defaultDocs` is in the JSON when known (`getting-started/overview` for `ai`).

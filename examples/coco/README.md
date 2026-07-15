# Coco — CLI dev-overlay coding agent

Coco is a drop-in command-line tool that wraps your project's dev server with
an in-page AI coding-agent chat panel. Run `coco` inside any web project, open
the URL it prints, and a floating chat appears on top of your running app. The
chat drives a real coding agent — [Claude Code], [Codex], [Gemini CLI], or
[OpenCode] — pointed at the project's working directory, so the agent edits
the live code and the dev server's HMR reloads the page.

[Claude Code]: https://docs.anthropic.com/en/docs/claude-code
[Codex]: https://developers.openai.com/codex
[Gemini CLI]: https://github.com/google-gemini/gemini-cli
[OpenCode]: https://opencode.ai

Coco is framework-agnostic: it reverse-proxies the dev server and injects a
small `<script>` into every HTML response. The panel renders inside a Shadow
DOM root, so it never collides with the host app's CSS or React/Vue/Svelte/etc.

> ⚠️ The agent writes to your project's working directory with real edits.
> Run inside a git repo and commit often.

## Quick start

Coco offers two integration paths. **Pick the first one for any Vite-based
project (TanStack Start, plain Vite, etc.); fall back to the proxy CLI for
non-Vite dev servers.**

### Recommended: `coco init` (TanStack Start / any Vite app)

```bash
# from the root of a TanStack Start / Vite project
pnpm dlx coco init   # or: npx coco init / pnpm coco init

pnpm dev             # start your dev server as usual
```

`coco init` adds the dev-only `coco/vite` plugin to your `vite.config.ts`
(idempotent — safe to re-run) and prints which supported agent CLIs it
found. After that the 🥥 launcher appears in the corner of every page your
dev server renders — **but only when at least one of `claude`, `codex`,
`gemini`, or `opencode` is found on `PATH`**. Otherwise the panel stays
silent so it never shows up on machines that don't have an agent installed.

Pass `--dry-run` to preview the rewrite without writing.

### Alternative: reverse-proxy CLI (framework-agnostic)

```bash
# from inside your web project (must have a "dev" script)
pnpm dlx coco            # or: npx coco, or: pnpm --filter coco dev
```

This spawns `pnpm dev` for you and serves a proxy on `:7777` that injects
the panel into every HTML response. Use this when you can't (or don't want
to) edit your dev tooling.

### Try it against the bundled sample-app

A bare-bones TanStack Start app lives at
[`examples/coco/sample-apps/simple-app`](sample-apps/simple-app) so you can
exercise Coco without finding a project of your own. It is intentionally
**not** part of the pnpm workspace — its deps are installed independently so
the workspace stays clean.

```bash
pnpm --filter coco build           # build the panel bundle once
pnpm --filter coco sample:install  # install the sample-app's deps
pnpm --filter coco sample:dev      # launch Coco in the sample-app
```

`sample:dev` runs `coco` with the sample-app as cwd; open the printed
Coco URL and ask the agent to change the page (e.g. "make the headline
green" or "add a third route"). When you want a blank slate again:

```bash
pnpm --filter coco sample:reset    # revert all sample-app edits, keep node_modules
```

`sample:reset` runs `git restore` + `git clean` scoped to
`sample-apps/simple-app/`, so it only touches that subdirectory and leaves
`node_modules` (and everything else `.gitignore`d) alone.

In proxy mode, Coco:

- runs `pnpm dev` as a subprocess and scrapes its stdout for the local URL,
- serves a reverse proxy on `http://localhost:7777` (override with `--port`),
- injects the chat panel into every HTML page it proxies,
- proxies WebSockets so HMR keeps working.

Open the printed Coco URL (not the dev server's URL!) and click the 🥥 button
in the corner. The launcher only appears when one of `claude`, `codex`,
`gemini`, or `opencode` is on `PATH` (cross-OS lookup, honors `PATHEXT` on
Windows).

### Flags

| Flag        | Default       | Description                                                       |
| ----------- | ------------- | ----------------------------------------------------------------- |
| `--port`    | `7777`        | Port Coco listens on.                                             |
| `--command` | `pnpm dev`    | Command Coco uses to start the dev server.                        |
| `--target`  | (auto)        | Existing dev-server URL — skips spawning `--command`.             |
| `--agent`   | `claude-code` | Default agent (`claude-code`, `codex`, `gemini-cli`, `opencode`). |
| `--mode`    | `edit`        | `edit` or `read-only` — default agent permission mode.            |

The panel itself has dropdowns for agent + mode, so flags only set defaults.

### Building the panel bundle

The panel bundle lives at `dist/client/client.js`. Build it once with:

```bash
pnpm --filter coco build
```

`pnpm --filter coco dev` (the development script) checks for the bundle and
prints a clear error if it's missing.

## Per-agent setup

Coco's agent backend reuses the same harness adapters as
[`examples/ts-react-coding-agent`](../ts-react-coding-agent/README.md). You
only need to set up the agent(s) you actually want to use; the others stay
selectable in the panel and surface a setup dialog explaining what's missing.

### Claude Code

```bash
npm i -g @anthropic-ai/claude-code
claude login                          # or: export ANTHROPIC_API_KEY=sk-ant-…
```

### Codex

```bash
codex login                           # or: export OPENAI_API_KEY=sk-…
```

The `codex` binary ships with `@openai/codex-sdk`. ChatGPT-account logins
can't run codex models in headless mode — use an API key or an entitled
account.

### Gemini CLI

```bash
npm i -g @google/gemini-cli
gemini                                # one-time interactive login
GEMINI_ACP_AUTH_METHOD=oauth-personal GEMINI_CLI_TRUST_WORKSPACE=true coco
```

For an API key instead, set `GEMINI_API_KEY` and
`GEMINI_ACP_AUTH_METHOD=gemini-api-key`.

### OpenCode

```bash
npm i -g opencode-ai
opencode auth login                   # or: export ANTHROPIC_API_KEY=sk-ant-…
```

## How it works

Two equivalent surfaces serve the same `__coco/*` endpoints and inject the
same panel `<script>`:

```
Vite-plugin mode (coco/vite, dev-only):
  browser ─▶ vite dev server ──┬─ transformIndexHtml + response wrapper
                                ├─ /__coco/client.js  (panel bundle)
                                └─ /__coco/api/*       (chat + agent status)

Proxy mode (coco CLI):
  browser ─▶ http://localhost:7777 (Coco proxy)
                ├─ proxies HTML / JS / CSS / WS ─▶ pnpm dev (e.g. :5173)
                ├─ injects <script src="/__coco/client.js"> into HTML
                ├─ /__coco/client.js (Shadow-DOM chat panel)
                └─ /__coco/api/*      (chat + agent status)
```

In both modes the panel uses the headless `ChatClient` from
`@tanstack/ai-client`, posting to `/__coco/api/chat`. The server runs
`chat()` from `@tanstack/ai` with one of the four CLI-agent adapters, `cwd`
set to the project root (Vite's `config.root` for the plugin,
`process.cwd()` for the CLI). Each chat turn forwards two pieces of UI
context:

- `route` — `location.pathname + search + hash`, tracked across SPA nav.
- `selectedElement` — when the user activates the picker (🎯 button) and
  clicks an element, its tag, selector, text, and a clipped `outerHTML` go
  along with the next message.

The server prepends those into the agent's system prompt so it knows which
file/component the user is talking about.

## Notes

- Coco is in `examples/coco` to demonstrate the CLI-agent adapters end-to-end.
  It is not published as an npm bin from this repo.
- Sessions don't survive switching agents (the harnesses don't share state).
- HMR works because the proxy forwards WebSocket upgrades. If your dev server
  emits an absolute URL in the HMR client, set the dev server to use the same
  port via `--target` or configure host/port in your dev config.

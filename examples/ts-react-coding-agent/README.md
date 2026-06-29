# TanStack AI — Coding Agent Example

A React (TanStack Start) app that drives **coding-agent harnesses** through
TanStack AI — [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
via `@tanstack/ai-claude-code`, [Codex](https://developers.openai.com/codex)
via `@tanstack/ai-codex`,
[Gemini CLI](https://github.com/google-gemini/gemini-cli) via
`@tanstack/ai-gemini-cli`, and [OpenCode](https://opencode.ai) via
`@tanstack/ai-opencode`, switchable from a dropdown.

Unlike a normal chat example, the agent here runs its own loop server-side
and executes its own tools — reading, searching, and (in Edit mode) editing
the files in `workspace/`. Its tool activity streams into the UI as a
timeline of resolved tool calls.

## What it demonstrates

- **Session resume** — the server emits the harness session id via a
  `<agent>.session-id` custom event (`claude-code.session-id`,
  `codex.session-id`, `gemini-cli.session-id`, `opencode.session-id`); the
  client pins it and sends
  it back through `forwardedProps` → `modelOptions.sessionId`, so follow-ups
  continue the same stateful session. Switching agents resets the session.
- **Harness tool timeline** — built-in tools (Read, Grep, Edit,
  command_execution, ...) arrive as already-resolved tool-call parts and
  render with their inputs/outputs. Note that Codex streams text
  message-at-a-time (its SDK has no token deltas), while Claude Code,
  Gemini CLI, and OpenCode stream token-by-token.
- **Permission modes** — a Read-only/Edit toggle maps to each harness's
  knobs: `disallowedTools` vs `permissionMode: 'acceptEdits'` for Claude
  Code, `sandboxMode: 'read-only'` vs `'workspace-write'` for Codex, and
  the default-deny vs `acceptEdits` permission policy for Gemini CLI and
  OpenCode. With Claude Code, Gemini CLI, and OpenCode, ask it to run a
  shell command and watch the denial show up in the timeline.
- **Tool bridging** — `lookup_style_guide` is an ordinary TanStack server
  tool the harness calls from inside its own loop (in-process MCP for
  Claude Code; a localhost Streamable-HTTP MCP bridge for Codex,
  Gemini CLI, and OpenCode).
- **Sandboxed cwd** — the agent only works inside `workspace/`.

## Running

This is a server-spawning example: each chat turn launches the selected
harness as a subprocess on your machine. You only need to set up the agent(s)
you actually want to try — the others stay selectable in the UI and pop a
setup dialog explaining what's missing (see [Runtime config detection](#runtime-config-detection)).

### 1. Set up the agent(s) you want

**Claude Code** ([docs](https://docs.anthropic.com/en/docs/claude-code))

```bash
npm i -g @anthropic-ai/claude-code   # install the CLI
claude login                         # log in with your Claude subscription
# …or, instead of `claude login`, set an API key in the server env:
export ANTHROPIC_API_KEY=sk-ant-…
```

The codex/gemini binaries are spawned per turn, so the CLI must be on `PATH`.

**Codex** ([docs](https://developers.openai.com/codex))

```bash
codex login                          # log in interactively
# …or set an API key in the server env (forwarded as CODEX_API_KEY):
export OPENAI_API_KEY=sk-…
```

The `codex` binary ships with `@openai/codex-sdk`, so there's nothing extra to
install. Note: a **ChatGPT-account** login can't run codex models in headless
mode — use an API key or an entitled account, otherwise the run fails with an
entitlement error from OpenAI.

**Gemini CLI** ([docs](https://github.com/google-gemini/gemini-cli))

```bash
npm i -g @google/gemini-cli          # ACP mode needs a current build
gemini                               # log in with Google once (interactive)
```

Headless ACP runs can't show an interactive auth picker, so you must tell the
adapter which method to use via `GEMINI_ACP_AUTH_METHOD` (e.g. `oauth-personal`
for a Google login, or `gemini-api-key`). If the CLI refuses the scratch
workspace as untrusted, also export `GEMINI_CLI_TRUST_WORKSPACE=true`. So, for
a Google-login setup, start the dev server like this:

```bash
GEMINI_ACP_AUTH_METHOD=oauth-personal GEMINI_CLI_TRUST_WORKSPACE=true pnpm dev
```

To use an API key instead, set `GEMINI_API_KEY` and
`GEMINI_ACP_AUTH_METHOD=gemini-api-key`.

**OpenCode** ([docs](https://opencode.ai/docs))

```bash
npm i -g opencode-ai                  # install the CLI
opencode auth login                   # authenticate a provider (interactive)
# …or set the provider API key in the server env (this example uses Anthropic):
export ANTHROPIC_API_KEY=sk-ant-…
```

The adapter spawns `opencode serve` per turn, so the CLI must be on `PATH`. The
example drives the `anthropic/claude-sonnet-4-5` model; point it at a different
`provider/model` in `src/routes/api.chat.ts` to use another provider.

### 2. Install and run

```bash
pnpm install
pnpm dev
```

### 3. Try it out

Open http://localhost:3000 and try:

- "What files are in this project, and what do they do?" (Read-only)
- Switch to **Edit mode**: "Fix the bug in temperature.js" — note it
  calls `lookup_style_guide` first.
- "Now update todo.md to check off what you did" — same session, no
  re-explaining.

Reset the demo workspace afterwards with `git checkout -- workspace/`.

## Runtime config detection

Environment variables and CLI logins live on the server, not in the browser, so
the route loader calls a `createServerFn` (`src/lib/agent-status.ts`) that
reports which agents are actually runnable. Every agent stays selectable in the
dropdown; picking one that isn't configured — or trying to send to it — opens a
dialog with the exact setup steps (sourced from `AGENT_SETUP` in
`src/lib/agents.ts`, which mirrors the instructions above). An agent counts as
configured when:

- **Claude Code** — `ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN` is set, or
  a `~/.claude.json` login exists.
- **Codex** — `OPENAI_API_KEY` / `CODEX_API_KEY` is set, or a
  `~/.codex/auth.json` login exists.
- **Gemini CLI** — `GEMINI_API_KEY` or `GEMINI_ACP_AUTH_METHOD` is set (a
  cached Google login alone isn't enough for headless ACP, so it isn't
  counted).
- **OpenCode** — a provider key (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` /
  `GEMINI_API_KEY`) is set, or an `opencode auth login` credential file
  (`~/.local/share/opencode/auth.json`) exists.

Detection runs at server startup time per request to the loader, so set your
env vars / log in **before** `pnpm dev` (or restart it after).

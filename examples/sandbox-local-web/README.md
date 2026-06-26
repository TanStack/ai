# Sandbox Coding Agent (TanStack AI)

A web chat where an AI coding agent builds and runs a real app **inside a
sandbox**, then hands back a live preview URL — switchable across **two
independent axes** to show off the provider-agnostic design:

```
HARNESS = claude-code | opencode     # which coding agent runs in the sandbox
SANDBOX = docker      | local        # where it runs
```

Defaults are `claude-code` on `docker`. The same UI, the same `chat()` +
`withSandbox()` wiring, the same bridged host tools (`tanstackStartRecipe`,
`exposePreview`), and the same preview flow work for **all four combinations** —
only the `provider:`/`adapter:` lines in
[`src/sandbox-agent.ts`](./src/sandbox-agent.ts) change, behind a small registry.

It's the [`sandbox-cloudflare`](../sandbox-cloudflare) example reshaped for a
plain **Node** host: where Cloudflare drives the agent loop inside a Durable
Object, this runs it inline in the `/api/run` route via `chat()`.

## How it works

1. The browser's `useChat` POSTs to `/api/run`.
2. The route runs `chat({ adapter, middleware: [withSandbox(sandbox)], tools: [...] })`
   with the selected harness adapter.
3. `withSandbox` resumes-or-creates the thread's sandbox; the harness adapter runs
   the coding agent (`claude` / `opencode serve`) inside it.
4. The `tanstackStartRecipe` + `exposePreview` host tools are bridged into the
   sandbox over MCP. The agent scaffolds a self-contained TanStack Start app, runs
   its dev server on port **5173**, and calls `exposePreview`.
5. `exposePreview` returns the reachable URL — `http://localhost:<mapped-port>`
   (docker publishes 5173 to a random host port) or `http://127.0.0.1:5173`
   (local) — the link shown in the UI.

## Prerequisites

- **`ANTHROPIC_API_KEY`** — both harnesses use an Anthropic model.
- `SANDBOX=docker` (default): a running **Docker daemon**.
- `SANDBOX=local`: the chosen CLI on your PATH — [`claude`](https://docs.claude.com/en/docs/claude-code)
  (`npm i -g @anthropic-ai/claude-code`) or [`opencode`](https://opencode.ai)
  (`npm i -g opencode-ai`). No isolation — the agent runs directly on your host.

## Run

```bash
# from the repo root: build the workspace packages first
pnpm install
pnpm build

cd examples/sandbox-local-web
export ANTHROPIC_API_KEY=sk-ant-...
pnpm dev   # http://localhost:3002
```

Switch combinations with env vars:

```bash
HARNESS=opencode pnpm dev            # OpenCode in Docker
SANDBOX=local pnpm dev               # Claude Code on the host (no isolation)
HARNESS=opencode SANDBOX=local pnpm dev
```

Then ask it to build something, e.g. _"Build a polished kanban board with
drag-and-drop and localStorage, then give me the preview URL."_

> On `docker`, the first message per thread is slow: it pulls `node:22` (once) and
> installs the harness CLI in the fresh container. Pre-bake an image with the CLI
> and set `SANDBOX_IMAGE=<your-image>` to skip that.

## Adding more providers

- **Another harness** (codex, gemini-cli, …): add an entry to the `HARNESSES`
  registry in `src/sandbox-agent.ts` — its adapter factory, install command, and
  any extra port to publish.
- **Another sandbox** (a hosted provider, edge containers, …): extend
  `makeProvider()` with another `@tanstack/ai-sandbox-*` provider. Nothing else
  changes — the route, UI, tools, and preview flow are provider-agnostic.

## Limitations

- **Local previews only.** The preview URL is `localhost`/`127.0.0.1` on your
  machine — fine for local dev, not shareable. A hosted provider would return a
  public URL instead.
- **One published port (5173).** Only the port published at create time is
  reachable from the host on `docker`, so the agent must run its dev server on
  5173 (the recipe + system-prompt guidance enforce this).
- **`SANDBOX=local` has no isolation.** The agent runs on your host with your CLI
  and PATH. Use it for the fast dev loop, not untrusted prompts.

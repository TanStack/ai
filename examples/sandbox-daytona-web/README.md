# Daytona Sandbox Coding Agent (TanStack AI)

A web chat where an AI coding agent (**Claude Code**) builds and runs a real app
**inside a [Daytona](https://www.daytona.io/) cloud sandbox**, then hands back a
live, **publicly shareable** preview URL.

It's the [`sandbox-local-web`](../sandbox-local-web) example reshaped for a
**hosted** sandbox provider — the same `chat()` + `withSandbox()` wiring and the
same UI, only the `provider:` line in
[`src/sandbox-agent.ts`](./src/sandbox-agent.ts) changes to
`daytonaSandbox(...)`.

## Hosted vs. local: what's different

On Docker/local the sandbox can reach your machine, so that example bridges host
tools into the agent over MCP and mints a `localhost` preview URL. A Daytona
sandbox runs in the cloud and **can't reach your laptop**, so this example:

- **Uses no bridged host tools** (`tools: []`). The scaffolding recipe is plain
  guidance, so it's inlined into the system prompt instead of bridged as a tool.
- **Pre-resolves the preview URL host-side.** Daytona's `getPreviewLink(port)`
  returns a public URL, so `/api/run` mints it up front (see `resolvePreviewUrl`)
  and tells the agent to share it once the dev server is up — no callback into
  the host. The preview is a real public URL, shareable with anyone.

## How it works

1. The browser's `useChat` POSTs to `/api/run`.
2. The route pre-resolves the public preview URL for port **5173**, then runs
   `chat({ adapter, middleware: [withSandbox(sandbox)], tools: [] })`.
3. `withSandbox` resumes-or-creates the thread's Daytona sandbox; the Claude Code
   adapter runs `claude` inside it.
4. Guided by the inlined recipe, the agent scaffolds a self-contained TanStack
   Start app, runs its dev server on port **5173** (bound to `0.0.0.0`), and
   shares the pre-minted preview URL.

## Prerequisites

- **`ANTHROPIC_API_KEY`** — the in-sandbox `claude` CLI uses an Anthropic model.
- **`DAYTONA_API_KEY`** — to create the cloud sandbox ([get one](https://app.daytona.io/)).

## Run

```bash
# from the repo root: build the workspace packages first
pnpm install
pnpm build

cd examples/sandbox-daytona-web
export ANTHROPIC_API_KEY=sk-ant-...
export DAYTONA_API_KEY=...
pnpm dev   # http://localhost:3003
```

Then ask it to build something, e.g. _"Build a polished kanban board with
drag-and-drop and localStorage, then give me the preview URL."_

> The first message per thread is slow: it creates a fresh Daytona sandbox and
> installs the `claude` CLI into it. Pre-bake a [Daytona snapshot](https://www.daytona.io/docs/snapshots/)
> with the CLI installed and pass `snapshot` to `daytonaSandbox(...)` to skip that.

## Extending it

- **Another harness** (OpenCode, Codex…): swap the `adapter` in
  `src/sandbox-agent.ts`. Harnesses that connect from the host to an in-sandbox
  server (e.g. OpenCode) need that port exposed via `getPreviewLink` too.
- **Another sandbox** (Vercel, Docker, edge containers…): swap the `provider:`
  line for another `@tanstack/ai-sandbox-*` provider — see the sibling
  [`sandbox-vercel-web`](../sandbox-vercel-web) and
  [`sandbox-local-web`](../sandbox-local-web) examples.

## Limitations

- **One preview port (5173).** The recipe and system-prompt guidance pin the dev
  server to 5173 (the port wired to the preview URL).
- **Sandboxes are billed and time-limited.** They live until deleted or until
  Daytona's auto-stop kicks in; a long idle thread may need a fresh sandbox.

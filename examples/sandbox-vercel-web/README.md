# Vercel Sandbox Coding Agent (TanStack AI)

A web chat where an AI coding agent (**Claude Code**) builds and runs a real app
**inside a [Vercel Sandbox](https://vercel.com/docs/sandbox) microVM**, then hands
back a live, **publicly shareable** preview URL.

It's the [`sandbox-local-web`](../sandbox-local-web) example reshaped for a
**hosted** sandbox provider — the same `chat()` + `withSandbox()` wiring and the
same UI, only the `provider:` line in
[`src/sandbox-agent.ts`](./src/sandbox-agent.ts) changes to
`vercelSandbox(...)`.

## Hosted vs. local: what's different

On Docker/local the sandbox can reach your machine, so that example bridges host
tools into the agent over MCP and mints a `localhost` preview URL. A Vercel
microVM runs in the cloud and **can't reach your laptop**, so this example:

- **Uses no bridged host tools** (`tools: []`). The scaffolding recipe is plain
  guidance, so it's inlined into the system prompt instead of bridged as a tool.
- **Pre-resolves the preview URL host-side.** Vercel's `sandbox.domain(port)`
  returns a public URL for any port declared at create time, so `/api/run` mints
  it up front (see `resolvePreviewUrl`) and tells the agent to share it once the
  dev server is up — no callback into the host. The preview is a real public URL,
  shareable with anyone.

## How it works

1. The browser's `useChat` POSTs to `/api/run`.
2. The route pre-resolves the public preview URL for port **5173** (declared in
   the provider's `ports`), then runs
   `chat({ adapter, middleware: [withSandbox(sandbox)], tools: [] })`.
3. `withSandbox` resumes-or-creates the thread's Vercel microVM; the Claude Code
   adapter runs `claude` inside it.
4. Guided by the inlined recipe, the agent scaffolds a self-contained TanStack
   Start app, runs its dev server on port **5173** (bound to `0.0.0.0`), and
   shares the pre-minted preview URL.

## Prerequisites

- **`ANTHROPIC_API_KEY`** — the in-sandbox `claude` CLI uses an Anthropic model.
- **Vercel credentials** — `VERCEL_TOKEN` (or `VERCEL_OIDC_TOKEN`),
  `VERCEL_TEAM_ID`, and `VERCEL_PROJECT_ID`. Create a token at
  [vercel.com/account/settings/tokens](https://vercel.com/account/settings/tokens).

## Run

```bash
# from the repo root: build the workspace packages first
pnpm install
pnpm build

cd examples/sandbox-vercel-web
export ANTHROPIC_API_KEY=sk-ant-...
export VERCEL_TOKEN=...
export VERCEL_TEAM_ID=team_...
export VERCEL_PROJECT_ID=prj_...
pnpm dev   # http://localhost:3004
```

Then ask it to build something, e.g. _"Build a polished kanban board with
drag-and-drop and localStorage, then give me the preview URL."_

> The first message per thread is slow: it creates a fresh Vercel microVM and
> installs the `claude` CLI into it. The sandbox has a 30-minute lifetime by
> default (`SANDBOX_TIMEOUT_MS` in `src/sandbox-agent.ts`).

## Extending it

- **Another harness** (OpenCode, Codex…): swap the `adapter` in
  `src/sandbox-agent.ts`. Harnesses that connect from the host to an in-sandbox
  server (e.g. OpenCode) need that port added to the provider's `ports` too.
- **Another sandbox** (Daytona, Docker, edge containers…): swap the `provider:`
  line for another `@tanstack/ai-sandbox-*` provider — see the sibling
  [`sandbox-daytona-web`](../sandbox-daytona-web) and
  [`sandbox-local-web`](../sandbox-local-web) examples.

## Limitations

- **One preview port (5173).** It's declared in the provider's `ports` and pinned
  by the recipe/system-prompt guidance, so the agent must run its dev server on 5173.
- **Sandboxes are billed and time-limited.** They stop after the configured
  timeout; a long idle thread may need a fresh sandbox.

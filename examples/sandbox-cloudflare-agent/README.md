# Cloudflare sandbox agent — TanStack Start app (Worker + Durable Objects + Container)

A reference **TanStack Start app** that runs a TanStack AI sandbox agent on the
edge — UI, agent, Durable Objects, and the container all ship in **one Cloudflare
Worker, one `wrangler deploy`**.

> **The demo:** ask the agent to _build a self-contained TanStack Start app_
> (a kanban board, a data dashboard, a small game…). It calls a bridged host tool
> (`tanstackStartRecipe`) for the current scaffolding recipe, builds the app inside
> the sandbox container, installs deps, starts the dev server, and hands back a live
> **preview URL** (routed by `proxyToSandbox`). The app it builds needs **no env,
> keys, or external services**, so the preview works for anyone — an agent shipping
> a running app on the edge with zero config.

The agent itself is still **one function call**:
`createCloudflareSandboxAgent()` (from `@tanstack/ai-sandbox-cloudflare/agent`)
returns the run-coordinator Durable Object, the `@cloudflare/sandbox` Sandbox DO,
and a stateless Worker fetch handler. `src/agent.ts` configures it:

```ts
import { createCloudflareSandboxAgent } from '@tanstack/ai-sandbox-cloudflare/agent'
import { claudeCodeText } from '@tanstack/ai-claude-code'

export const agent = createCloudflareSandboxAgent({
  adapter: () => claudeCodeText('sonnet'),
  tools: () => [tanstackStartRecipe], // optional chat() server tools, bridged over MCP
})
```

…and `src/server.ts` — the custom Cloudflare entry point — re-exports the DO
classes and composes the agent with the Start request handler so both live in one
Worker:

```ts
import handler from '@tanstack/react-start/server-entry'
import { proxyToSandbox } from '@cloudflare/sandbox'
import { agent } from './agent'

export const RunCoordinator = agent.Coordinator // wrangler DO binding
export const Sandbox = agent.Sandbox // wrangler container binding

export default {
  async fetch(request, env, ctx) {
    const proxied = await proxyToSandbox(request, env) // sandbox preview ports
    if (proxied) return proxied
    const { pathname } = new URL(request.url)
    // The agent owns /runs, /_bridge, /tool-exec; everything else is the UI.
    if (isAgentPath(pathname) && agent.worker.fetch)
      return agent.worker.fetch(request, env, ctx)
    return handler.fetch(request) // TanStack Start SSR + /api/* routes
  },
} satisfies ExportedHandler
```

The browser uses a vanilla `useChat` against the `/api/run` server route, which
bridges the agent's POST-then-WebSocket protocol to the SSE stream `useChat`
expects (see `src/routes/api.run.ts`).

Under the hood: a stateless Worker _triggers_ a run and returns immediately, a
Durable Object _coordinator_ drives the run to completion (surviving
hibernation), and clients _stream_ the result over a WebSocket with **resumable
cursors** so a reconnect never loses or replays an event. All of that lives inside
`@tanstack/ai-sandbox-cloudflare`.

> **Status: runnable reference, not runtime-verified in this repo.** This example
> type-checks (`pnpm typecheck`) and builds (`pnpm build`) against the real
> Cloudflare + `@cloudflare/sandbox` + TanStack AI types and follows the proven
> run-log / tool-bridge contracts, but it has **not** been executed end-to-end
> against a live Workers runtime in this monorepo's CI. The `@cloudflare/vite-plugin`
> runs the Worker + DOs + container in `workerd` for both `vite dev` and
> `wrangler deploy`. Claude Code **does** run on the Cloudflare sandbox (the
> adapter delivers the prompt via a file + shell stdin-redirection). See
> **[Limitations](#limitations)**.

---

## DO-drives vs. co-located: where `chat()` runs

This example uses the **default `do-drives` model**: the coordinator Durable
Object runs `chat()` itself and serves the MCP tool-bridge from its own `fetch`
handler; the container only runs the `claude` CLI. The whole MCP protocol crosses
the container→DO boundary.

`@tanstack/ai-sandbox-cloudflare` also supports a **`colocated` model** (pass
`mode: 'colocated'` + a `runInContainerHarness` container program from
`@tanstack/ai-sandbox-cloudflare/runner`): the harness loop **and** the bridge run
_inside_ the container, and only host-tool **execution** crosses back. That keeps
the MCP transport on container localhost at the cost of a second build target
(the in-container runner must be bundled into the image). The DO-drives path is
the simpler one to teach and run, so it's what this example shows; see
`docs/sandbox/overview.md` ("Edge execution: two models") for the full tradeoff.

---

## Why this shape?

A normal request/response handler holds the HTTP connection open for the whole
agent run. That does not work at the edge: a Worker invocation is short-lived
and tied to one request, and a multi-minute agent loop will outlive it. The fix
is to **invert** the model — separate _triggering_ a run from _driving_ it. The
factory builds exactly this topology for you:

```
                      POST /runs  (trigger)            GET /runs/:id/stream  (tail)
                           │                                   │
                           ▼                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Worker  (agent.worker)  — STATELESS router. Never drives a run.             │
│   • POST /runs            → coordinator.startRun(...)  → 202 { runId }  ◀──┐  │
│   • GET  /runs/:id        → coordinator.status(...)    → run record        │  │
│   • GET  /runs/:id/stream → hand the WebSocket to the DO                   │  │
│   • *    /_bridge/:runId  → forward to the DO (MCP tool-bridge)            │  │
└───────────────────────────────┬───────────────────────────────────────────┘  │
                                │ DO RPC / fetch                            202 returns
                                ▼                                        immediately;
┌─────────────────────────────────────────────────────────────────────────────┐│ Worker
│  RunCoordinator Durable Object  (agent.Coordinator) — OWNS the run.         ││ invocation
│   • startRun: chat() + the sandbox + the configured adapter, piped into the ││ ENDS here.
│     durable run-log (returns immediately).                                  │┘
│   • Kept alive across hibernation by ctx.waitUntil(done) + a watchdog alarm.│
│   • WebSocket tails: replay persisted events after the client cursor, then  │
│     live-tail (hibernatable via ctx.acceptWebSocket).                       │
│   • /_bridge/:runId: serves MCP from its OWN fetch handler (no TCP listener),│
│     gated by a per-run bearer token (constant-time Web Crypto compare).     │
│   • run-log persisted in DO storage.                                        │
└───────────────────────────────┬───────────────────────────────────────────┘
                                │ @cloudflare/sandbox  (exec / files / ports)
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Cloudflare Sandbox (Container)  — the `claude` CLI runs here (Dockerfile).  │
│   • The in-sandbox agent calls the tool-bridge over MCP at                   │
│     https://<PUBLIC_HOSTNAME>/_bridge/:runId  → back up to the DO.           │
└─────────────────────────────────────────────────────────────────────────────┘
```

Everything in the two boxes above is implemented in
`@tanstack/ai-sandbox-cloudflare`; the sections below explain how it behaves.

---

## How the Worker does NOT hang

`POST /runs` makes a single RPC into the coordinator, which opens the run-log,
kicks off `chat()` **without awaiting it**, registers the driving promise with
`ctx.waitUntil(done)`, arms a watchdog alarm, and returns `{ runId }`. The agent
loop is **not** awaited by the Worker: the `202` is sent the moment the run is
_registered_, and the Worker invocation ends. The Durable Object keeps running
the agent in the background because the outstanding `ctx.waitUntil` promise keeps
the instance alive until the run is terminal.

The run-log pump **never rejects**: a thrown stream error is recorded as a
`RUN_ERROR` event plus the run record's `error` field, so there is nothing to
throw back to a caller that no longer exists — failures are always observable by
tailing clients.

## How streaming resumes from a cursor

Every `StreamChunk` the agent emits is appended to a durable, `seq`-indexed log
persisted in DO storage. A client tails it:

```
GET /runs/:id/stream?threadId=<thread>&lastSeq=<n>
```

The coordinator accepts a **hibernatable** WebSocket (`ctx.acceptWebSocket`),
replays everything after `lastSeq` from storage, then live-tails to the terminal
event. The socket's cursor is stashed with `serializeAttachment` so it survives
hibernation; on reconnect the client sends its last-seen `seq` and the server
replays exactly what was missed — no gaps, no duplicates. Because the events
live in storage (not in any open stream), a dropped connection, a new browser
tab, or an evicted coordinator all reconnect cleanly. `GET /runs/:id` (without
`/stream`) is a non-streaming **poll fallback** that just returns the record.

## How the tool-bridge is served from the DO (no TCP listener)

`chat()`-provided **server tools** (the `tools` you pass the factory) are exposed
to the in-sandbox agent as an MCP server. On a long-running host that bridge is a
`node:http` listener — which is exactly what you _cannot_ open in a Worker/DO. So
instead:

1. A DO-backed `ToolBridgeProvisioner` is provided to `chat()`. The Claude Code
   adapter uses it instead of the default `node:http` provisioner.
2. The provisioner mints a per-run bearer token and returns a URL on the Worker's
   public hostname: `https://<PUBLIC_HOSTNAME>/_bridge/:runId?threadId=…`.
3. The agent's MCP calls hit that URL → the Worker forwards to the coordinator →
   the DO's `fetch` handler checks the token (constant-time **Web Crypto**
   compare, since `node:crypto.timingSafeEqual` is unavailable at the edge) and
   serves the JSON-RPC from the in-memory tool core.

No raw socket is ever opened; the bridge rides the same fetch surface as the rest
of the DO. The demo `tanstackStartRecipe` tool in `src/agent.ts` exercises this
path: the in-sandbox agent calls it before building. The container ships the
`tanstack` CLI (the Dockerfile `npm i -g @tanstack/cli`), so the recipe scaffolds
with `tanstack create … --intent` — which writes **TanStack Intent** skill mappings
into the generated project for coding agents. (This is the fix for "the in-sandbox
`claude` is a bare install with none of your host skills": rather than ship the
skill files, ship the CLI that provisions them.) The bridge still carries the
sandbox-specific guidance the generic skill can't know — build a no-env app, and
bind/expose the dev server for a preview URL.

---

## Files

| File                      | Role                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/agent.ts`            | `createCloudflareSandboxAgent()` + the `tanstackStartRecipe` and `exposePreview` host tools.                |
| `src/sandbox-provider.ts` | `namedCloudflareSandbox` — pins the container to the run's `threadId` so `exposePreview` can reach it.      |
| `src/server.ts`           | Custom Cloudflare entry: re-exports the DOs and composes `proxyToSandbox` + the agent + Start SSR.          |
| `src/routes/index.tsx`    | The chat UI (`useChat` → `/api/run`) + the clickable **Open preview** link.                                 |
| `src/routes/api.run.ts`   | Same-origin proxy: bridges the agent's POST-then-WebSocket run protocol to the SSE stream `useChat` reads.  |
| `wrangler.jsonc`          | DO + Container + Sandbox bindings (`RUN_COORDINATOR` + `Sandbox`), migrations, `nodejs_compat`.             |
| `Dockerfile`              | Container image: `@cloudflare/sandbox` base + the `claude` CLI + the `tanstack` CLI (scaffolding + Intent). |
| `vite.config.ts`          | `@cloudflare/vite-plugin` + `tanstackStart()` — builds + runs the Worker in `workerd`.                      |

## Run it locally

**Prerequisites:** Docker running (the plugin builds + runs the Container image
locally), Node 20+, `pnpm`, and an `ANTHROPIC_API_KEY`.

```bash
# 1) Install workspace deps (from the repo root)
pnpm install

# 2) From THIS directory, provide your key for local dev. The plugin reads
#    .dev.vars; the factory injects it into the sandbox env for the `claude` CLI.
cd examples/sandbox-cloudflare-agent
cp .dev.vars.example .dev.vars      # then edit .dev.vars and set ANTHROPIC_API_KEY

# 3) (Optional) regenerate Cloudflare binding types after editing wrangler.jsonc
pnpm cf-typegen

# 4) Start the dev server — the Worker + Durable Objects + Container run in
#    workerd. First run builds the Dockerfile (installs the claude CLI; needs Docker).
pnpm dev                            # http://localhost:3001
```

> **Running the agent locally needs a tunnel.** With plain `pnpm dev`, the
> in-container agent can't reach your local Worker's `/_bridge` (the `tanstack`
> MCP server), so a run fails with "the tanstack MCP server hasn't come up". Use a
> Cloudflare tunnel so the container can reach the host:
>
> ```bash
> brew install cloudflared            # once
> pnpm dev:tunnel                     # starts a quick tunnel + sets PUBLIC_HOSTNAME + vite
> ```
>
> `dev:tunnel` (see `scripts/dev-tunnel.mjs`) runs `cloudflared tunnel --url
http://localhost:3001`, writes the assigned `*.trycloudflare.com` host into
> `.dev.vars` as `PUBLIC_HOSTNAME`, then starts `vite`. The container reaches the
> bridge over the public tunnel hostname, so agent runs work locally.
>
> A quick tunnel serves only ONE hostname, so the **tool-bridge works but preview
> URLs don't** (they need wildcard subdomains). For previews locally too, use a
> **named tunnel** with a wildcard route (`*.dev.yourdomain.com` →
> `http://localhost:3001`) and set `PUBLIC_HOSTNAME` to `dev.yourdomain.com`.
> Otherwise, deploy to see previews.

Open `http://localhost:3001` for the chat UI, or drive the agent's HTTP surface
directly:

```bash
# 1) Trigger — returns 202 immediately, the DO drives the agent in the background
curl -sX POST http://localhost:3001/runs \
  -H 'content-type: application/json' \
  -d '{"threadId":"t1","messages":[{"role":"user","content":"Build a self-contained TanStack Start kanban app (no env), run it, and return the preview URL."}]}'
# → { "runId": "..." }

# 2) Tail over WebSocket from the start (lastSeq=-1); reconnect with your last seq.
websocat "ws://localhost:3001/runs/<runId>/stream?threadId=t1&lastSeq=-1"

# 3) Or poll the status (non-streaming fallback)
curl -s "http://localhost:3001/runs/<runId>?threadId=t1"
```

**Deploying:** `pnpm deploy`, set the production key with
`wrangler secret put ANTHROPIC_API_KEY`, and set `PUBLIC_HOSTNAME` in
`wrangler.jsonc` `vars` to your `*.workers.dev` / custom domain (the in-sandbox
agent uses it to reach the `/_bridge` MCP endpoint for the `tools` you pass).

## Showing the app (preview URLs)

The agent builds and runs the app inside the container, then calls the
`exposePreview` host tool (`{ port: 3000 }`) once its dev server is up. That tool
runs on the host, calls `sandbox.exposePort(port, { hostname: PUBLIC_HOSTNAME })`
on the run's container, and returns a URL of the form
`https://<port>-<sandboxId>-<token>.<PUBLIC_HOSTNAME>`. `proxyToSandbox` (in
`src/server.ts`) routes that hostname back into the container, and the UI renders
it as a clickable **Open preview** link.

For the host to address the right container, the sandbox is pinned to the run's
`threadId` (see `src/sandbox-provider.ts`) instead of the default random id.

> **Deployed vs. local.** Preview URLs rely on **wildcard DNS** — they resolve on a
> deployed Worker (`*.workers.dev` / your custom domain) but generally **not** under
> `localhost` (the `https` scheme + non-wildcard local DNS don't line up). So build
>
> - run works locally, but to actually open the preview, deploy (`pnpm deploy`). The
>   `exposePort` URL is built from `PUBLIC_HOSTNAME`, so that var must be your real
>   request host.

## Setting sandbox env

Which env vars get injected into the container is controlled by the `sandbox`
resolver in `src/agent.ts`: each `createSecrets({ … })` entry becomes an env var
the agent can read. (The demo app the agent builds needs none — `ANTHROPIC_API_KEY`
here is only for the `claude` CLI, i.e. the agent itself.)
Values come from the Worker `env`, so to add one:

1. add the value to `.dev.vars` (local) / `wrangler secret put` (prod), and
2. add the key to `createSecrets({ … })` (extend the env type if you want it typed
   — see the comment in `src/agent.ts`).

These are **host-controlled** secrets — the same for every user of the deployment.
There is no built-in lane for the browser user to set per-run secrets (the run
trigger only carries `threadId` + `messages`); see the note in **Limitations**.

---

## Limitations

Read these before treating this as production-ready. They are specific and
honest.

1. **Agent runs need a deploy; `PUBLIC_HOSTNAME` must match.** The in-sandbox
   agent's container reaches the host over `PUBLIC_HOSTNAME` for the `/_bridge`
   MCP tool-bridge (the `tanstack` MCP server: `tanstackStartRecipe` /
   `exposePreview`) and for preview ports. So:
   - `PUBLIC_HOSTNAME` **must** be the hostname your Worker is actually served on.
     If it's wrong (e.g. the committed value points at a different account), the
     agent reports **"the tanstack MCP server hasn't come up"** — it's hitting the
     wrong instance, which has no bridge for your run (a 404). Fix: set
     `PUBLIC_HOSTNAME` to your `*.workers.dev` / custom domain and redeploy.
   - A **local `pnpm dev`** container can't reach your host over that hostname, so
     plain local runs fail. Use **`pnpm dev:tunnel`** (a `cloudflared` quick
     tunnel — see [Run it locally](#run-it-locally)) to give the host a
     container-reachable hostname; the tool-bridge then works locally. Preview URLs
     still need a wildcard (named tunnel or a deploy).
   - There is also no Workers runtime in this monorepo's CI, and some local
     container runtimes (e.g. OrbStack) can't run Cloudflare containers at all.
     This app type-checks (`pnpm typecheck`) and builds (`pnpm build`) against the
     real types and follows contracts proven by the package unit tests, but treat it
     as the _architecture blueprint_ until you've run it on your own deploy.

2. **The Cloudflare sandbox has no writable host→process stdin (handled).**
   Cloudflare background processes don't expose a writable stdin —
   `spawn().stdin.write` throws (see
   `packages/ai-sandbox-cloudflare/src/handle.ts`), advertised as
   `capabilities.writableStdin: false`. The Claude Code adapter normally pipes
   the prompt to `claude` over stdin (to keep it out of argv); when it sees
   `writableStdin: false` it instead writes the prompt to a file and redirects
   the CLI's stdin from it **in-shell** (`claude -p … < /tmp/prompt`). The
   redirection happens inside the container, so no host-side stdin write is
   needed and the prompt still never lands in argv. Claude Code therefore runs
   on the Cloudflare provider. (Duplex/interactive ACP harnesses that need
   ongoing two-way stdin — not Claude Code — would still need the future
   Cloudflare stdin path.)

3. **Container disk is ephemeral.** The Cloudflare sandbox's
   `durableFilesystem` capability is `false`, so the workspace is re-bootstrapped
   under the same identity across cold starts (`withSandbox` handles this). Don't
   assume files written in one run survive an eviction unless you persist them
   yourself.

4. **Sandbox env is host-controlled, not per-user.** The injected secrets (see
   [Setting sandbox env](#setting-sandbox-env)) come from the Worker `env` and are
   the same for every caller. The run trigger (`StartRunInput`) carries only
   `threadId` + `messages`, so there is no built-in lane for the browser user to
   supply their own secret for the app the agent builds. Adding one means dropping
   from the factory to the exported `ChatSandboxCoordinator`, overriding
   `config(input)` to read a per-thread secret you stashed in DO storage (via a
   small `POST` endpoint) — and treating it carefully: the sandbox runs
   LLM-authored code, so any injected secret is readable by the agent. Don't put
   one user's secret in a sandbox another user can reach.

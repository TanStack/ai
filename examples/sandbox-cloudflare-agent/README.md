# Cloudflare Workers + Durable Objects + Containers agent (TanStack AI)

A reference app for running a **TanStack AI sandbox agent on the edge** — and the
whole app is **one function call**. `createCloudflareSandboxAgent()` (from
`@tanstack/ai-sandbox-cloudflare/agent`) returns the run coordinator Durable
Object, the `@cloudflare/sandbox` Sandbox DO, and the Worker fetch handler, so
`src/worker.ts` is just config + export wiring:

```ts
import { createCloudflareSandboxAgent } from '@tanstack/ai-sandbox-cloudflare/agent'
import { claudeCodeText } from '@tanstack/ai-claude-code'

const agent = createCloudflareSandboxAgent({
  adapter: () => claudeCodeText('sonnet'),
  tools: () => [lookup], // optional chat() server tools, bridged over MCP
})

export const RunCoordinator = agent.Coordinator
export const Sandbox = agent.Sandbox
export default agent.worker
```

Under the hood: a stateless Worker _triggers_ a run and returns immediately, a
Durable Object _coordinator_ drives the run to completion (surviving
hibernation), and clients _stream_ the result over a WebSocket with **resumable
cursors** so a reconnect never loses or replays an event. All of that now lives
inside the package — this example used to hand-write `src/coordinator.ts` and
`src/run-log-do.ts` for it; both are gone.

> **Status: runnable reference, not runtime-verified in this repo.** This
> example compiles against the real `@cloudflare/workers-types`,
> `@cloudflare/sandbox`, and TanStack AI packages and follows the proven run-log
> / tool-bridge contracts. It has **not** been executed against a live Workers
> runtime in this monorepo's CI (no Workers runtime here; examples aren't built
> by Nx) — run it yourself with `wrangler dev` (see **[Run it locally](#run-it-locally)**).
> Claude Code **does** run on the Cloudflare sandbox: the adapter delivers the
> prompt via a file + shell stdin-redirection (the sandbox has no writable
> host→process stdin), so no stdin write is needed. See **[Limitations](#limitations)**.

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
of the DO. The demo `lookup` tool in `src/worker.ts` exercises this path.

---

## Files

The agent itself is the package; this app is one file plus its Cloudflare config.

| File             | Role                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| `src/worker.ts`  | The whole app: `createCloudflareSandboxAgent()` + one demo host tool, exporting the DO classes + the Worker. |
| `wrangler.jsonc` | DO + Container + Sandbox bindings (`RUN_COORDINATOR` + `Sandbox`), migrations, `nodejs_compat`.              |
| `Dockerfile`     | Container image: `@cloudflare/sandbox` base + the `claude` CLI.                                              |

## Run it locally

**Prerequisites:** Docker running (Wrangler builds + runs the Container image
locally), Node 20+, `pnpm`, a recent `wrangler` (installed as a devDependency),
and an `ANTHROPIC_API_KEY`.

```bash
# 1) Install workspace deps (from the repo root)
pnpm install

# 2) From THIS directory, provide your key for local dev. `wrangler dev` reads
#    .dev.vars; the factory injects it into the sandbox env for the `claude` CLI.
cd examples/sandbox-cloudflare-agent
cp .dev.vars.example .dev.vars      # then edit .dev.vars and set ANTHROPIC_API_KEY

# 3) Start the local Worker + Durable Objects + Container.
#    First run builds the Dockerfile (installs the claude CLI) — needs Docker.
pnpm dev                            # serves on http://localhost:8787
```

Then, in another terminal, trigger a run and tail it:

```bash
# 1) Trigger — returns 202 immediately, the DO drives the agent in the background
curl -sX POST http://localhost:8787/runs \
  -H 'content-type: application/json' \
  -d '{"threadId":"t1","messages":[{"role":"user","content":"Create hello.txt with the text hi"}]}'
# → { "runId": "..." }

# 2) Tail over WebSocket from the start (lastSeq=-1); reconnect with your last seq.
#    Any WS client works; e.g. websocat:
websocat "ws://localhost:8787/runs/<runId>/stream?threadId=t1&lastSeq=-1"

# 3) Or poll the status (non-streaming fallback)
curl -s "http://localhost:8787/runs/<runId>?threadId=t1"
```

**Deploying:** `pnpm deploy`, set the production key with
`wrangler secret put ANTHROPIC_API_KEY`, and set `PUBLIC_HOSTNAME` in
`wrangler.jsonc` `vars` to your `*.workers.dev` / custom domain (the in-sandbox
agent uses it to reach the `/_bridge` MCP endpoint for the `tools` you pass).

---

## Limitations

Read these before treating this as production-ready. They are specific and
honest.

1. **Compile-only / not runtime-verified in this repo.** There is no Workers
   runtime in this monorepo's CI, and examples are not built by Nx. This app
   type-checks (`pnpm typecheck`) against the real Cloudflare + TanStack AI
   types and follows the contracts proven by the package unit tests, but it has
   not been executed end-to-end here. Treat it as the _architecture blueprint_.

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

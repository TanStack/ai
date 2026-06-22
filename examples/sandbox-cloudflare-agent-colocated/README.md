# Cloudflare agent — CO-LOCATED ("combined") sandbox model (TanStack AI)

A reference architecture where the **agent harness loop AND its MCP tool-bridge
run INSIDE the container**, and the Durable Object stays OUTSIDE as a thin
durable coordinator. The Worker _triggers_ a run, the `RunCoordinator` DO _tells
the container's in-container runner to run the agent_ and pumps its event stream
into a durable run-log, and clients _stream_ the result over a WebSocket with
**resumable cursors**.

This is the counterpart to **[`examples/sandbox-cloudflare-agent`](../sandbox-cloudflare-agent)**,
which drives the container from OUTSIDE the DO (the DO itself calls `chat()`).
See **[How this differs](#how-this-differs-from-sandbox-cloudflare-agent)**.

> **Status: compile-only reference, NOT runtime-verified in this repo.** This
> example type-checks (`pnpm typecheck`, `tsc -b`) against the real
> `@cloudflare/workers-types`, `@cloudflare/sandbox`, and TanStack AI packages
> and reuses the proven run-log / remote-tool contracts from `@tanstack/ai-sandbox`.
> It has **not** been executed against a live Workers runtime or a built
> container image here (examples aren't built by Nx; there's no Workers runtime
> in CI). Run it yourself with `wrangler dev` — see **[Run it locally](#run-it-locally)**.

---

## Request flow

```
                  POST /runs  (trigger)             GET /runs/:id/stream  (tail)
                       │                                    │
                       ▼                                    ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│  Worker  (src/worker.ts)  — STATELESS router. Never drives a run.             │
│   • POST /runs            → coordinator.startRun(...)  → 202 { runId }  ◀────┐  │
│   • GET  /runs/:id        → coordinator.status(...)    → run record          │  │
│   • GET  /runs/:id/stream → hand the WebSocket to the DO                     │  │
│   • *    /tool-exec/:runId→ forward to the DO (host-tool EXECUTION)          │  │
└───────────────────────────────┬─────────────────────────────────────────────┘  │
                                │ DO RPC / fetch                              202 returns
                                ▼                                          immediately
┌───────────────────────────────────────────────────────────────────────────────┐
│  RunCoordinator Durable Object  (src/coordinator.ts) — THIN durable coordinator│
│   • does NOT call chat() — it tells the container's runner to.                 │
│   • startRun: ensure the runner is up, POST /run to it with the host-tool      │
│     descriptors + a per-run tool-exec token & URL, then read its NDJSON        │
│     StreamChunk stream and append each chunk to the run-log via RunController. │
│   • Kept alive across hibernation by ctx.waitUntil(done) + a watchdog alarm.   │
│   • WebSocket tails: replay persisted events after the cursor, then live-tail. │
│   • /tool-exec/:runId: bearer-checked → executeHostTool(hostTools, …) → result.│
│   • run-log persisted in DO storage  (src/run-log-do.ts)                       │
└───────┬───────────────────────────────────────────────────▲────────────────────┘
        │ ① containerFetch POST /run {messages, toolDescriptors,                  │
        │      toolExecUrl, toolExecToken}  ──▶                                   │
        │ ① ◀── NDJSON stream of StreamChunk                                      │
        ▼                                                                         │
┌───────────────────────────────────────────────────────────────────────────────┐
│  Container  (Dockerfile)  —  src/container-runner.ts runs HERE.               │
│   • runs chat({ adapter: claudeCodeText, tools: remoteToolStubs(…),           │
│       middleware: [withSandbox(localProcessSandbox())] }) on the container's   │
│       OWN localhost: native stdin, in-container MCP bridge, no public URL.     │
│   • streams each StreamChunk back to the DO as NDJSON.                         │
│   • the agent's tool calls →  in-container MCP bridge → stub.execute →         │
│       httpRemoteToolExecutor → ② POST /tool-exec/:runId back up to the DO. ────┘
└───────────────────────────────────────────────────────────────────────────────┘
```

## The two cross-boundary channels

Everything the agent needs at runtime — the harness loop, the MCP transport,
the prompt over native stdin — lives on the container's own `localhost`. Only
**two** things cross the container ↔ DO boundary:

1. **events OUT (runner → DO).** The in-container runner streams each
   `StreamChunk` to the DO over the `POST /run` response body as **NDJSON** (one
   JSON object per line). The DO adapts that stream into an
   `AsyncIterable<StreamChunk>` and drives it through the SAME
   `RunController` / `pipeToRunLog` the non-co-located example uses, appending
   every chunk to the durable `DurableObjectRunEventLog`. Clients resume-tail it
   over the WebSocket exactly as before.

2. **host-tool EXECUTION (container → DO).** The DO owns the REAL `chat()` tools
   (their `execute()` touches DB / secrets / app state). It serializes them with
   `toolDescriptors()` and sends only the descriptors into the container, where
   `remoteToolStubs()` rebuilds them as stubs whose `execute()` delegates to
   `httpRemoteToolExecutor()` — a bearer-gated `POST { name, args }` to the DO's
   `/tool-exec/:runId`. The DO runs the real tool with `executeHostTool()` and
   returns `{ result }`. The MCP protocol itself never leaves the container; the
   public surface shrinks to one authenticated tool-exec call.

Both reuse the already-built, exported APIs in
`@tanstack/ai-sandbox` (`toolDescriptors`, `remoteToolStubs`,
`httpRemoteToolExecutor`, `executeHostTool`, `RunController`, `pipeToRunLog`,
`isTerminalRunStatus`) — this example reimplements none of that logic.

---

## How this differs from `sandbox-cloudflare-agent`

| | `sandbox-cloudflare-agent` (DO-drives-container) | **this example (co-located)** |
| --- | --- | --- |
| Who runs `chat()` / the harness loop? | the **DO** | the **container** (`src/container-runner.ts`) |
| Where is the MCP tool-bridge served? | from the DO's `fetch` (`/_bridge/:runId`), reached from the container over the public hostname | on the container's **own localhost** (default `node:http` host transport); never leaves the container |
| In-container sandbox | `cloudflareSandbox()` (the DO drives a remote container) | `localProcessSandbox()` (the container **is** the host) |
| Prompt → `claude` CLI | file + shell stdin-redirection (Cloudflare sandbox has no writable host→process stdin) | **native writable stdin** (a local process has a writable stdin) |
| What crosses the boundary | the whole MCP protocol (DO → container) + the chunk stream stays inside the DO | only ① the NDJSON event stream and ② host-tool **execution** |
| Role of the DO | owns + drives the run | **thin durable coordinator**: run-log + client streaming + host-tool execution |

The co-located shape keeps the entire agent runtime (harness, MCP, stdin) on one
host and reduces the public network surface to a single authenticated tool-exec
call. The trade-off is that the runner must be **bundled into the container
image** (below), and the DO can no longer introspect the agent loop directly —
it only sees the event stream and the tool-exec callbacks.

---

## Files

| File | Role |
| --- | --- |
| `src/worker.ts` | Stateless entry Worker: routes, returns `202` immediately, exports the DO classes. |
| `src/coordinator.ts` | `RunCoordinator` DO: ensures + drives the container runner, pumps its NDJSON into the run-log, serves WebSocket tails and the `/tool-exec` host-tool endpoint, holds the real host tools. |
| `src/container-runner.ts` | The IN-CONTAINER runner (bundled into the image): runs `chat()` with `localProcessSandbox()` + `claudeCodeText`, streams chunks back as NDJSON, delegates tool execution to the DO. |
| `src/protocol.ts` | The `POST /run` wire contract (`RunRequest`) + its narrowing guard, shared by the DO and the runner. |
| `src/run-log-do.ts` | `DurableObjectRunEventLog` — the resumable run event-log over DO storage (copied from the sibling example). |
| `wrangler.jsonc` | DO + Container + Sandbox bindings, migrations, `nodejs_compat`. |
| `Dockerfile` | Container image: `@cloudflare/sandbox` base + the `claude` CLI + the bundled runner. |

## Run it locally

**Prerequisites:** Docker running (Wrangler builds + runs the Container image
locally), Node 20+, `pnpm`, a recent `wrangler` (a devDependency), and an
`ANTHROPIC_API_KEY`.

```bash
# 1) Install workspace deps (from the repo root)
pnpm install

cd examples/sandbox-cloudflare-agent-colocated

# 2) Bundle the in-container runner. The Dockerfile COPYs dist/container-runner.mjs,
#    so this MUST run before `wrangler dev` / `deploy` builds the image.
pnpm build:runner

# 3) Provide your key for local dev. `wrangler dev` reads .dev.vars; the
#    coordinator injects it into the container env for the `claude` CLI.
cp .dev.vars.example .dev.vars      # then edit .dev.vars and set ANTHROPIC_API_KEY

# 4) Start the local Worker + Durable Objects + Container.
#    First run builds the Dockerfile (installs the claude CLI + copies the
#    runner) — needs Docker.
pnpm dev                            # serves on http://localhost:8787
```

Then, in another terminal, trigger a run and tail it:

```bash
# 1) Trigger — returns 202 immediately; the DO drives the agent in the background
curl -sX POST http://localhost:8787/runs \
  -H 'content-type: application/json' \
  -d '{"threadId":"t1","messages":[{"role":"user","content":"Use lookup_docs for the topic \"sandboxes\" and summarise it"}]}'
# → { "runId": "..." }

# 2) Tail over WebSocket from the start (lastSeq=-1); reconnect with your last seq.
websocat "ws://localhost:8787/runs/<runId>/stream?threadId=t1&lastSeq=-1"

# 3) Or poll the status (non-streaming fallback)
curl -s "http://localhost:8787/runs/<runId>?threadId=t1"
```

The demo ships one host tool, `lookup_docs`, whose `execute()` runs in the DO.
When the in-container agent calls it, the call flows
agent → in-container MCP bridge → `httpRemoteToolExecutor` → the DO's
`/tool-exec/:runId` → `executeHostTool` → back. Swap it for your own
DB-/secrets-backed tools; the container only ever sees the serialized
descriptors.

**Deploying:** `pnpm build:runner && pnpm deploy`, set the production key with
`wrangler secret put ANTHROPIC_API_KEY`, and set `PUBLIC_HOSTNAME` in
`wrangler.jsonc` `vars` to your `*.workers.dev` / custom domain (the container
uses it to reach `/tool-exec`).

---

## Limitations

Read these before treating this as production-ready.

1. **Compile-only / not runtime-verified in this repo.** There is no Workers
   runtime in this monorepo's CI, and examples are not built by Nx. This package
   type-checks (`tsc -b`) against the real Cloudflare + TanStack AI types and
   the runner bundles with esbuild, but it has not been executed end-to-end
   here. Treat it as the _architecture blueprint_.

2. **The runner must be bundled into the image.** `src/container-runner.ts` is
   not `npm install`ed in the container — it is bundled to a single
   self-contained ESM file (`pnpm build:runner` → `dist/container-runner.mjs`)
   that the Dockerfile `COPY`s to `/app/container-runner.mjs`. **Run
   `pnpm build:runner` before any `wrangler dev` / `deploy`**, or the image
   build fails at the `COPY`. The base image's `ENTRYPOINT` is the sandbox
   control server (port 3000), so the DO starts the runner as a process
   (`startProcess`) and reaches it on `RUNNER_PORT` via `containerFetch` — it
   does NOT override the container entrypoint.

3. **In-container local-process: native stdin, in-container bridge.** Because
   the in-container sandbox is `localProcessSandbox()` (the container is the
   host), the Claude Code adapter feeds the prompt over **native writable
   stdin** and serves its MCP tool-bridge on the container's own `localhost`.
   No file-redirect, and the bridge URL/token never leave the container — that
   is the whole point of the co-located model.

4. **Container disk is ephemeral.** The Cloudflare sandbox's filesystem is
   re-bootstrapped across cold starts. Files written in one run are not
   guaranteed to survive an eviction unless you persist them yourself. The
   durable run-log (DO storage) is the source of truth for run history.

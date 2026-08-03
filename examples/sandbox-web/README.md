# Sandbox Web (TanStack AI)

A web chat where an AI coding agent builds and runs a real app **inside a
sandbox**, then hands back a live preview URL — and the run is **durable**: it
survives a refresh, a closed tab, and a lost connection.

The stack is deliberately fixed — **Grok Build** (the `grok` CLI, model
`grok-4.5`) in a **Docker** sandbox — because this app is the runnable demo of
the [durable runs](../../docs/sandbox/durable-runs.md) journal-only tier, and
durability's one hard requirement is that a run be reconstructible from its
`runId` alone (the takeover route and the reaper have nothing else). One
adapter on one provider keeps that rebuild — and the whole example — small.
For the same `chat()` + `withSandbox()` wiring switched across harnesses live
in the UI, see [`sandbox-cloudflare`](../sandbox-cloudflare) (its edge/
Durable-Object sibling, running Claude Code, Codex, or Grok Build).

## How it works

1. The browser's `useChat` POSTs `{ messages, data: { threadId } }` to
   `/api/run` (the run id rides the `X-Run-Id` header, minted by the client).
2. The route runs `chat({ adapter, middleware: [withPersistence, withLocks,
withSandbox(sandbox, { runs, durability })], … })` — see
   [`src/run-durable.ts`](./src/run-durable.ts) for the one shared assembly.
3. `withSandbox` resumes-or-creates the thread's sandbox; the `grok` CLI runs
   inside it and streams its events back out through the journal.
4. The agent scaffolds a self-contained TanStack Start app, runs its dev server
   on port **5173**, and mints the preview URL via the bridged `exposePreview`
   host tool (Docker is same-machine, so host tools are bridged over MCP).

## Durable runs (survive a refresh; Stop is a real cancel)

`withSandbox` gets a `RunStore` + a delivery-durability adapter
(`memoryStream`), the thread id and transcript persist in `localStorage`, and
`/api/run` serves both the producing `POST` and the `joinRun`/takeover `GET`.

Try it, in order:

1. **Refresh mid-run.** Start a build, wait for tool calls to begin, refresh
   the tab. The agent never stops; the page comes back, rejoins the run from
   the delivery log, and streams the rest — no repeated text, no gap.
2. **Close the tab entirely,** reopen `localhost:3002` a minute later. Same
   thing: the stored thread id finds the active run (`/api/run/active`) and
   the whole run so far replays, then tails live.
3. **Stop is a cancel.** The Stop button calls `/api/run/cancel` — the durable
   band records `cancelRequested`, the in-process band aborts with
   `RUN_CANCEL_REASON`, and the sandbox is destroyed. Contrast with a refresh,
   which detaches. A disconnect and a Stop produce the identical TCP close;
   only the endpoint tells the server which one you meant.
4. **Abandon a run** (close the tab and don't come back). Within ~5 minutes
   the scheduled reaper sweeps it: finished runs are finalized, expired ones
   destroyed — watch for `[reaper]` lines in the dev-server console. This is
   the easy-to-forget half of the opt-in; without it, detached sandboxes bill
   forever.

The tier's documented trade: every store here is in-process memory, so log
durability equals the dev server's lifetime — a **server** restart forgets
runs (the takeover route then just serves nothing and the UI starts clean).
Surviving that needs the log-first tier (a durable `StreamDurability` backend
— what [`sandbox-cloudflare`](../sandbox-cloudflare) gets from a Durable
Object) plus durable `RunStore`/`LockStore` backends.

## Prerequisites

- a running **Docker daemon**
- `XAI_API_KEY` (or `GROK_API_KEY`) — see [`.env.example`](./.env.example)

## Run

```bash
# from the repo root: build the workspace packages first
pnpm install
pnpm build

cd examples/sandbox-web
cp .env.example .env   # set XAI_API_KEY
pnpm dev               # http://localhost:3002
```

Then ask it to build something, e.g. _"Build a polished kanban board with
drag-and-drop and localStorage, then give me the preview URL."_ — and refresh
the page mid-build.

> The first message per thread is slow: it pulls `node:22` (once) and installs
> the `grok` CLI in the fresh container. Pre-bake an image with the CLI and set
> `SANDBOX_IMAGE=<your-image>` to skip that.

## Swapping the stack

The fixed choices live in one file, [`src/sandbox-agent.ts`](./src/sandbox-agent.ts):
`buildAdapter()` (the harness), `buildSandbox()` (the provider + CLI install +
secrets), and `missingEnv()` (the auth check). Swap `grokBuildText` for
`claudeCodeText` / `codexText` and `dockerSandbox` for another provider and the
durable wiring is unchanged — it only ever sees the definitions. If you make
the stack a **per-request browser choice** instead, every route that arrives
with only a `runId` (takeover, reaper) needs that choice stored server-side —
see the note at the top of [`src/run-durable.ts`](./src/run-durable.ts).

## Limitations

- **Previews are localhost-only** (not shareable): the preview URL maps the
  container's published port on your machine.
- **One preview port (5173).** Only the port published at create time is
  reachable, so the agent must run its dev server on 5173 (the recipe +
  guidance enforce this).

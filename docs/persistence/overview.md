---
title: Persistence Overview
id: overview
---

Persistence makes server-side `chat()` runs durable and resumable. Add
`withPersistence(...)` when the server should own the thread transcript, replay
streamed AG-UI events after a reconnect, resume pending user decisions, or share
storage primitives with sandbox and workflow extensions.

Persistence is optional middleware. A run with no persistence middleware behaves
exactly as before.

## Control ladder

Persistence has several control levers. Start at the lowest rung that gives
your app the durability it needs, then opt into more stores only when a feature
requires them.

| Lever | You control | TanStack AI provides | Use it when |
| --- | --- | --- | --- |
| No persistence | Nothing | Normal in-memory run behavior | A run can disappear after the request ends. |
| Client resume snapshot | Where the client stores `{ threadId, runId, cursor }` | `persistence.server`, `autoResume`, and `resume()` in the client hooks | A page refresh should reconnect to a still-durable server run. |
| Messages | `stores.messages.loadThread` and `saveThread` | Server-authoritative thread history loading/saving | The server owns the transcript instead of trusting the browser. |
| Durable replay | `stores.runs` and `stores.publicEvents` | Opaque cursors, run records, AG-UI event append, and replay | Reconnects must continue a run without calling the model again. |
| Interrupts | `stores.interrupts` plus replay stores | Durable pending human decisions and resume payload handling | A run can pause for approval, input, or another user action. |
| Internal checkpoints | `stores.internalEvents` | A separate non-UI event log | Packages or app workflows need checkpoints that should not replay to users. |
| Metadata | `stores.metadata` | Namespaced key/value access | Your app needs durable correlation, manifests, or integration state. |
| Locks | `stores.locks` | Shared lock capability consumed by integrations | Multiple workers can resume or mutate the same durable resource. |
| Artifacts and blobs | `stores.artifacts` and `stores.blobs` | Durable artifact refs for generated files and media | Runs create downloadable files, media, or workspace checkpoints. |
| SQL or platform backend | Database schema, migration timing, deployment topology | Backend factories that implement the same stores | You want TanStack primitives on top of your chosen database or platform. |

For production, prefer user-owned persistence through an `AIPersistence` object
created with `defineAIPersistence(...)` or a backend factory that returns the
same store contract. TanStack AI should call your existing storage boundary
through store callback methods; it should not be the part of your production
system that silently owns raw SQL schema lifecycle or data-retention policy.

Packaged backends such as SQLite, Postgres, Prisma, Drizzle, and Cloudflare are
useful primitives when they fit your stack. They still expose the same
`AIPersistence` stores, so you can start with a backend package, replace one
store at a time, or compose SQL metadata with object storage for artifacts.

## What persistence stores

`withPersistence(...)` can:

- load and save a thread's server-authoritative message history,
- create and update run records with status, usage, and errors,
- append every streamed public AG-UI event with an opaque cursor,
- replay persisted events after `{ threadId, runId, cursor }`,
- persist pending user-actionable interrupts,
- validate optional stores before a feature silently loses durability,
- provide locks, metadata, artifacts, and blobs to integrations that need them.

The primary extension point is `AIPersistence`, usually created with
`defineAIPersistence(...)` or a backend factory such as
`sqlitePersistence(...)`. The older `ChatPersistence` and
`defineChatPersistence` names remain deprecated compatibility aliases.

## Pick the page for your scenario

If you are building a persisted chat UI, start with
[Resumable Chat](./resumable-chat). It shows both sides: a server endpoint using
`withPersistence` and a client that forwards `threadId`, `runId`, `cursor`, and
`resume` so reconnects continue the same run. Use the headless
`persistence.server` option to store the client's latest resume snapshot for
full page reload recovery.

If you are building image, audio, speech, transcription, or video generation
hooks that should survive refresh, start with
[Resumable Generations](./resumable-generations). It shows the server endpoint
using `generationParamsFromRequest(...)`, `withPersistence(...)`, and
`toServerSentEventsResponse(...)`, plus the client hook using
`persistence.server`, `autoResume`, and `resume()`.

If your run can pause for a human decision, read
[Interrupts and Approvals](./interrupts-and-approvals). It covers durable
pending waits, AG-UI `resume[]` payloads, and how legacy approval UI maps onto
the newer interrupt path.

If you are choosing a Node database backend, read
[SQL Backends](./sql-backends). SQLite, Postgres, Drizzle, and Prisma share the
same persistence model but differ in migration ownership. The shared SQL core
also has a MySQL dialect for adapter authors, but there is not a standalone
MySQL backend package.

If you deploy on Workers, read [Cloudflare](./cloudflare). D1 stores the core
run state, R2 can store blobs and artifact bytes, and Durable Objects can
provide cross-isolate locks.

If a run creates downloadable files, generated artifacts, large blobs, or
workspace files that must survive sandbox/container eviction, read
[Files and Artifacts](./files-and-artifacts). It covers normal run artifacts,
generation media artifacts, app-owned blobs, sandbox workspace checkpointing,
and the D1/R2/Durable Object layout used on Cloudflare.

If you own the storage layer or are extending persistence for MCP/workflows,
read [Custom Stores](./custom-stores). It explains the optional `AIPersistence`
stores, public versus internal events, metadata, locks, artifacts, and blobs.

If you persist coding-agent sandboxes, read
[Sandbox Runs](./sandbox-runs). It shows how
`withSandbox(...)` consumes durable sandbox records and locks directly from
`withPersistence(...)`.

## Installation

Install the core package and the backend package that matches your deployment:

```sh
pnpm add @tanstack/ai-persistence @tanstack/ai-persistence-sqlite
```

For prototypes and tests, `memoryPersistence()` ships in
`@tanstack/ai-persistence`. Durable apps usually use one of the backend
packages: `@tanstack/ai-persistence-sqlite`,
`@tanstack/ai-persistence-postgres`, `@tanstack/ai-persistence-cloudflare`,
`@tanstack/ai-persistence-drizzle`, or `@tanstack/ai-persistence-prisma`.

## Durable replay state

The replay identity is:

```ts
type ResumeState = {
  threadId: string
  runId: string
  cursor: string
}
```

Treat `cursor` as opaque. Store and forward it, but do not parse it. When a
request includes a cursor, `chat()` replays the persisted event tail after that
cursor instead of calling the model again.

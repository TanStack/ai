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

If you own the storage layer or are extending persistence for MCP/workflows,
read [Custom Stores](./custom-stores). It explains the optional `AIPersistence`
stores, public versus internal events, metadata, locks, artifacts, and blobs.

If you persist coding-agent sandboxes, read
[Sandbox Runs](./sandbox-runs). It shows how
`@tanstack/ai-sandbox-persistence` bridges durable sandbox records and locks
between `withPersistence` and `withSandbox`.

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

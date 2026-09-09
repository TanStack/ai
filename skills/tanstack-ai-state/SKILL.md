---
name: tanstack-ai-state
description: >
  Keep AI conversations alive with TanStack AI: save chat history server-side,
  resume a stream after a dropped connection, persist human approvals across a
  restart, survive a browser reload, and compact long conversations to fit the
  context window. Use when someone asks how to store chat messages in a
  database (Drizzle, Prisma, D1, Postgres), resume or reconnect a run, add
  approvals or interrupts, or handle a conversation that outgrows the model's
  context. Triggers on "chat history", "save messages", "persistence", "resume",
  "reconnect", "interrupts", "approvals", "compaction", "context window".
---

# TanStack AI state and delivery

Two different problems get confused here. Sort them before picking a package.

| Question                                                                          | Layer               | Package                       |
| --------------------------------------------------------------------------------- | ------------------- | ----------------------------- |
| The connection dropped mid-stream. Can it carry on?                               | Delivery durability | `@tanstack/ai-durable-stream` |
| The conversation must exist after a reload, on another device, or after a restart | State persistence   | `@tanstack/ai-persistence`    |
| The conversation outgrew the context window                                       | Compaction          | `@tanstack/ai-compaction`     |

Reload survival in the browser alone needs no package: client persistence ships
in `@tanstack/ai` and its framework packages. Read
`@tanstack/ai#ai-core/client-persistence` first (`npx @tanstack/intent@latest load`),
and skip the server package when nothing else needs it.

The Persistence docs cover all three:
https://tanstack.com/ai/latest/docs/persistence/overview.

## Server persistence

`@tanstack/ai-persistence` wraps a chat with `withPersistence()` and a set of
stores. The stores are independent, so provide only the ones the app needs:
messages, runs, interrupts, metadata, and the generation stores for media.

Its skill routes to per-stack recipes that write a `chat-persistence.ts` against
the database the app already has:

```bash
npx @tanstack/intent@latest list
npx @tanstack/intent@latest load @tanstack/ai-persistence#ai-persistence
```

Read the recipe for the app's stack (Drizzle, Prisma, Cloudflare, or the custom
adapter guide) rather than inventing a schema.

## Durable interrupts

Human approvals that must survive a restart need the interrupts store, so they
belong with persistence. An approval that only has to survive the current page
does not.

## Multi-instance locks

`withLocks()` ships in `@tanstack/ai` from the `locks` entry, next to the code
it coordinates. Its skill is `ai-core/locks`. It is not a persistence store.

---
name: tanstack-ai-state
description: >
  Keep TanStack AI conversations alive: server-side chat persistence, resumable
  streams, human approvals that survive a restart, browser persistence, and
  context-window compaction. Use when someone asks how to save chat history,
  survive a reload or a dropped connection, resume a run, store messages in
  Drizzle, Prisma, D1, or Postgres, or stop a long conversation from
  overflowing the context window. Triggers on "chat history", "persistence",
  "resume", "reconnect", "interrupts", "approvals", "compaction", "database".
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
`node_modules/@tanstack/ai/skills/ai-core/client-persistence/SKILL.md` first,
and skip the server package when nothing else needs it.

[`packages.md`](./packages.md) lists the packages in this group.

## Server persistence

`@tanstack/ai-persistence` wraps a chat with `withPersistence()` and a set of
stores. The stores are independent, so provide only the ones the app needs:
messages, runs, interrupts, metadata, and the generation stores for media.

Its skill routes to per-stack recipes that write a `chat-persistence.ts` against
the database the app already has:

```bash
ls node_modules/@tanstack/ai-persistence/skills/ai-persistence/
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

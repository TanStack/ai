---
'@tanstack/ai-persistence': minor
'@tanstack/ai-persistence-drizzle': minor
'@tanstack/ai-persistence-prisma': minor
'@tanstack/ai-persistence-cloudflare': minor
---

Add server-side persistence for `chat()`: durable thread messages, run records, and interrupts.

`withChatPersistence(persistence)` is a chat middleware that stores the conversation transcript, tracks each run's status, and records interrupt state so a paused run (tool approval, client-tool execution, generic interrupt) survives a server restart. Point it at any backend that implements the store contract:

- `@tanstack/ai-persistence` — the store contracts, the `withChatPersistence` / `withGenerationPersistence` middleware, and an in-memory reference store (`memoryPersistence`) plus a conformance testkit.
- `@tanstack/ai-persistence-drizzle` — Drizzle-backed stores (SQLite via `node:sqlite`, plus a bring-your-own-schema contract) with migration and schema CLIs.
- `@tanstack/ai-persistence-prisma` — Prisma-backed stores with a models CLI that emits a provider-neutral schema fragment.
- `@tanstack/ai-persistence-cloudflare` — D1-backed stores (delegating to the Drizzle backend) plus a Durable-Object lock store for cross-instance locking.

Resume reconstruction is delegated to the chat engine: persistence records interrupts and gates new input on a thread with pending interrupts, while the engine rebuilds the resume tool state from the resume batch and the interrupt bindings carried in the (server-loaded) message history.

`reconstructChat(persistence, request)` is a server helper that returns a thread's stored messages as a JSON `Response`, so a server-authoritative client can hydrate its transcript on load from a one-line `GET` handler.

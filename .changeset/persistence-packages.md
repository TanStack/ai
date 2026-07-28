---
'@tanstack/ai-persistence': minor
---

Add server-side persistence for `chat()`: durable thread messages, run records, and interrupts.

`withPersistence(persistence)` is a chat middleware that stores the conversation transcript, tracks each run's status, and records interrupt state so a paused run (tool approval, client-tool execution, generic interrupt) survives a server restart.

`@tanstack/ai-persistence` ships the **contract**, not a backend for your database:

- The four store interfaces — `MessageStore`, `RunStore`, `InterruptStore`, `MetadataStore` — with the invariants the middleware depends on (full-replace `saveThread`, idempotent `createOrResume`, insert-if-absent interrupt `create`, `requestedAt`-ascending listings).
- The `withPersistence` / `withGenerationPersistence` middleware, plus `composePersistence` to assemble stores that live in different systems.
- `memoryPersistence()`, an in-process reference backend for dev and tests.
- `LockStore` / `withLocks` / `InMemoryLockStore` for cross-worker coordination — deliberately **not** a state store, and not composable through `composePersistence`.
- A shared conformance testkit at `@tanstack/ai-persistence/testkit`. `runPersistenceConformance` exercises every method of every store you provide and fails loudly on a store that is missing without being declared in `skip`.

Implement the stores against whatever database you already run and hand the result to `withPersistence` — the core never inspects your tables, so the schema stays yours. The [Build Your Own Adapter](https://tanstack.com/ai/latest/docs/persistence/build-your-own-adapter) guide walks through a complete `node:sqlite` backend end to end, and the package ships Agent Skills with worked Drizzle, Prisma, and Cloudflare D1 recipes (`npx @tanstack/intent@latest install`). `examples/ts-react-chat` runs on a self-contained `node:sqlite` adapter built this way and verified by the conformance testkit.

Resume reconstruction is delegated to the chat engine: persistence records interrupts and gates new input on a thread with pending interrupts, while the engine rebuilds the resume tool state from the resume batch and the interrupt bindings carried in the (server-loaded) message history.

`reconstructChat(persistence, request)` is a server helper that returns a thread's stored messages as a JSON `Response`, so a server-authoritative client can hydrate its transcript on load from a one-line `GET` handler.

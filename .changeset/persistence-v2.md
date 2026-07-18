---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-persistence': patch
'@tanstack/ai-persistence-cloudflare': patch
'@tanstack/ai-persistence-drizzle': patch
'@tanstack/ai-persistence-prisma': patch
'@tanstack/ai-sandbox': minor
'@tanstack/ai-event-client': patch
'@tanstack/ai-angular': minor
'@tanstack/ai-preact': minor
'@tanstack/ai-react': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-svelte': minor
'@tanstack/ai-vue': minor
---

Persistence v2: durable state via middleware and a pluggable store contract.

State durability lives on the middleware layer as `withChatPersistence` /
`withGenerationPersistence`, backed by a store contract (messages, runs,
interrupts, metadata, locks, artifacts, blobs). The `@tanstack/ai-persistence`
package ships a state-only middleware, an in-core memory backend, and a
shared conformance suite; `@tanstack/ai-persistence-drizzle` and
`@tanstack/ai-persistence-prisma` provide ORM state backends, while
`@tanstack/ai-persistence-cloudflare` provides first-class D1, Durable Object,
and R2-backed stores.

Replaying a disconnected/reloaded stream (resumable streams) is a separate
transport-level feature and ships independently — the persistence middleware
owns zero delivery-event storage.

The home-grown delivery/event-log subsystem is removed: the in-band `cursor` on
`StreamChunk`, the `cursor` param on `chat()`, the public/internal event stores,
the `ResumeSource` seam, cursor-replay client machinery, and the deprecated
approval-store shim are all deleted (this feature is unreleased — no back-compat
shims). Interrupt resume (approvals / client-tool results via
`RunAgentInput.resume[]`) is preserved as state durability, and the client
(`@tanstack/ai-client`) plus every framework binding (`@tanstack/ai-react`,
`-solid`, `-vue`, `-svelte`, `-angular`, `-preact`) switch to interrupt-only
resume.

The delivery-store / SQL-driver packages that only existed to back the removed
event log — `@tanstack/ai-persistence-sql`,
`@tanstack/ai-persistence-sqlite`, and `@tanstack/ai-persistence-postgres` — are
removed. They were never published (part of this same unreleased persistence
work), so no npm tombstone release is needed.

Generation events no longer expose transport cursors; they retain their thread
and run identifiers for correlation.

**Breaking (`@tanstack/ai-client` and every framework binding):** the
`persistence` option changed shape. It was a single flat message-storage adapter
and is now a `{ client?, server? }` object — `client` stores the rendered
`UIMessage[]` (keyed by the chat `id`) and `server` stores the resume snapshot
`{ resumeState, pendingInterrupts }` (keyed by `threadId`). This is a hard
rename with no bridging union, so a flat adapter no longer type-checks. Migrate
by moving your existing message adapter under `client`:

```ts
// Before
useChat({
  connection,
  persistence: localStoragePersistence(),
})

// After
useChat({
  connection,
  persistence: {
    client: localStoragePersistence(), // messages (chat id)
    // server: localStoragePersistence(), // optional: resume snapshot (threadId)
  },
})
```

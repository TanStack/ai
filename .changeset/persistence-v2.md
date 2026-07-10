---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-durable-stream': patch
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

Persistence v2: split state (middleware) vs delivery (transport) durability.

State durability stays on the middleware layer as `withChatPersistence` /
`withGenerationPersistence`, backed by a store contract (messages, runs,
interrupts, metadata, locks, artifacts, blobs). The `@tanstack/ai-persistence`
package now ships a state-only middleware, an in-core memory backend, and a
shared conformance suite; `@tanstack/ai-persistence-drizzle` and
`@tanstack/ai-persistence-prisma` provide ORM state backends, while
`@tanstack/ai-persistence-cloudflare` provides first-class D1, Durable Object,
and R2-backed stores.

Delivery durability (replay a disconnected/reloaded stream) moves to the
transport layer via a pluggable `StreamDurability` sink — the SDK owns zero
delivery-event storage. The new `@tanstack/ai-durable-stream` package provides a
durable-streams-protocol `StreamDurability` adapter, and the client
(`@tanstack/ai-client`) plus every framework binding (`@tanstack/ai-react`,
`-solid`, `-vue`, `-svelte`, `-angular`, `-preact`) switch to resumable SSE with
interrupt-only resume.

The home-grown delivery/event-log subsystem is removed: the in-band `cursor` on
`StreamChunk`, the `cursor` param on `chat()`, the public/internal event stores,
the `ResumeSource` seam, cursor-replay client machinery, and the deprecated
approval-store shim are all deleted (this feature is unreleased — no back-compat
shims). Interrupt resume (approvals / client-tool results via
`RunAgentInput.resume[]`) is preserved as state durability.

The delivery-store / SQL-driver packages that only existed to back the removed
event log — `@tanstack/ai-persistence-sql`,
`@tanstack/ai-persistence-sqlite`, and `@tanstack/ai-persistence-postgres` — are
removed. They were never published (part of this same unreleased persistence
work), so no npm tombstone release is needed.

Generation events no longer expose transport cursors. Stream offsets remain
owned by delivery-durability adapters; generation events retain their thread
and run identifiers for correlation.

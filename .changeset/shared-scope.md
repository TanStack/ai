---
'@tanstack/ai': minor
---

**Add a shared `Scope` identity type to `@tanstack/ai`.**

`Scope` is the single identity/isolation vocabulary for the subsystems that
persist or recall per-conversation data — `@tanstack/ai-persistence` and
`@tanstack/ai-memory`. Rather than each subsystem inventing its own notion of
"whose data is this?", both import one type:

```ts
interface Scope {
  threadId: string // required — the single conversation key (same as ctx.threadId)
  userId?: string // durable end-user identity; required in practice for multi-user apps
  tenantId?: string // multi-tenant boundary
  namespace?: string // reserved logical partition; no subsystem keys on it yet
}
```

`threadId` is the one conversation key across the codebase (matching
`ChatMiddlewareContext.threadId`, with `conversationId` already deprecated in
favor of it) — subsystems must not introduce a second name (`sessionId`, …) for
the same concept. Every field is an isolation boundary and must be derived
server-side from trusted session state, never from client input.

This is additive: nothing consumes `Scope` yet. It lands ahead of the
persistence and memory PRs so both build on one settled, unambiguous identity
contract instead of diverging.

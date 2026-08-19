---
id: Scope
title: Scope
---

# Interface: Scope

Defined in: [packages/ai/src/scope.ts:23](https://github.com/TanStack/ai/blob/main/packages/ai/src/scope.ts#L23)

Shared identity/isolation scope for the TanStack AI subsystems that persist
or recall per-conversation data — `@tanstack/ai-persistence` (keyed CRUD over
threads, runs, interrupts) and `@tanstack/ai-memory` (ranked recall/save).

Both subsystems answer the same underlying question — "whose data is this?" —
so they share ONE identity vocabulary defined here rather than each inventing
its own. `threadId` is the single conversation key across the codebase (it is
`ChatMiddlewareContext.threadId`, and `conversationId` is deprecated in favor
of it); a subsystem must never introduce a second name (`sessionId`,
`conversationId`, …) for the same concept.

## Security

A `Scope` is an isolation boundary. Derive every field server-side from
trusted, validated session state — **never** from client input. `threadId`
in particular resolves from a client-supplied value on the request, so a
subsystem that reads/writes user-owned data (memory, per-user metadata) must
pair it with a server-trusted `userId`/`tenantId` and must not treat a bare
client `threadId` as sufficient isolation: thread ids are guessable, so on
their own they let one caller read another's data.

## Properties

### namespace?

```ts
optional namespace?: string;
```

Defined in: [packages/ai/src/scope.ts:46](https://github.com/TanStack/ai/blob/main/packages/ai/src/scope.ts#L46)

Logical partition within a tenant/user (e.g. separating distinct memory
banks or persistence namespaces). Reserved — no subsystem keys on it yet;
adapters that don't understand it must ignore it rather than error.

***

### tenantId?

```ts
optional tenantId?: string;
```

Defined in: [packages/ai/src/scope.ts:40](https://github.com/TanStack/ai/blob/main/packages/ai/src/scope.ts#L40)

Tenant/organization boundary for multi-tenant deployments. When present,
every read and write must be confined to it.

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/scope.ts:29](https://github.com/TanStack/ai/blob/main/packages/ai/src/scope.ts#L29)

The conversation this data belongs to. Required — the minimal isolation
key both subsystems already center on. Same concept as
`ChatMiddlewareContext.threadId`.

***

### userId?

```ts
optional userId?: string;
```

Defined in: [packages/ai/src/scope.ts:35](https://github.com/TanStack/ai/blob/main/packages/ai/src/scope.ts#L35)

Durable end-user identity, for cross-thread recall and per-user isolation.
Optional, but required in practice for any multi-user deployment — a
`threadId` alone is not an authorization boundary (see Security above).

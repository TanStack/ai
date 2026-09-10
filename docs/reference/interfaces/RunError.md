---
id: RunError
title: RunError
---

# Interface: RunError

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:99](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L99)

Why a run failed.

A bare message is an LLM provider's prose: it changes between model
versions and cannot be branched on. `code` is what a consumer switches over
to decide whether to retry, escalate, or surface a specific UI.

## Properties

### code?

```ts
optional code?: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:102](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L102)

Stable, machine-branchable classification, when the provider supplies one.

***

### message

```ts
message: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:100](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L100)

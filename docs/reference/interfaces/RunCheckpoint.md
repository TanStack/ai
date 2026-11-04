---
id: RunCheckpoint
title: RunCheckpoint
---

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:218](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L218)

What a run saved at its last model or tool boundary.

## Properties

### at

```ts
at: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:220](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L220)

Epoch ms of the checkpoint.

***

### pendingTools?

```ts
optional pendingTools?: object[];
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:222](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L222)

Tools that started but had no result yet at the checkpoint.

#### name

```ts
name: string;
```

#### replay

```ts
replay: "safe" | "never";
```

#### toolCallId

```ts
toolCallId: string;
```

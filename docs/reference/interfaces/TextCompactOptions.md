---
id: TextCompactOptions
title: TextCompactOptions
---

Defined in: [packages/ai/src/types.ts:1534](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1534)

What `TextAdapter.compact` receives.

## Properties

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/types.ts:1536](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1536)

The history to compact.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1537](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1537)

***

### signal?

```ts
optional signal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:1538](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1538)

***

### systemPrompts?

```ts
optional systemPrompts?: SystemPrompt[];
```

Defined in: [packages/ai/src/types.ts:1542](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1542)

The system prompts of the chat call.

***

### wrapFetch?

```ts
optional wrapFetch?: FetchWrapper;
```

Defined in: [packages/ai/src/types.ts:1540](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1540)

Wraps the fetch of the compaction request.

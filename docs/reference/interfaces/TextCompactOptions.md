---
id: TextCompactOptions
title: TextCompactOptions
---

Defined in: [packages/ai/src/types.ts:1585](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1585)

What `TextAdapter.compact` receives.

## Properties

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/types.ts:1587](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1587)

The history to compact.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1588](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1588)

***

### signal?

```ts
optional signal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:1589](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1589)

***

### systemPrompts?

```ts
optional systemPrompts?: SystemPrompt[];
```

Defined in: [packages/ai/src/types.ts:1593](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1593)

The system prompts of the chat call.

***

### wrapFetch?

```ts
optional wrapFetch?: FetchWrapper;
```

Defined in: [packages/ai/src/types.ts:1591](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1591)

Wraps the fetch of the compaction request.

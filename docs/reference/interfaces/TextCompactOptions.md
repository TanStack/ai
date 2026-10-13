---
id: TextCompactOptions
title: TextCompactOptions
---

Defined in: [packages/ai/src/types.ts:1498](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1498)

What `TextAdapter.compact` receives.

## Properties

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/types.ts:1500](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1500)

The history to compact.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1501](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1501)

***

### signal?

```ts
optional signal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:1502](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1502)

***

### systemPrompts?

```ts
optional systemPrompts?: SystemPrompt[];
```

Defined in: [packages/ai/src/types.ts:1506](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1506)

The system prompts of the chat call.

***

### wrapFetch?

```ts
optional wrapFetch?: FetchWrapper;
```

Defined in: [packages/ai/src/types.ts:1504](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1504)

Wraps the fetch of the compaction request.

---
id: TextCompactOptions
title: TextCompactOptions
---

Defined in: packages/ai/src/types.ts:1529

What `TextAdapter.compact` receives.

## Properties

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: packages/ai/src/types.ts:1531

The history to compact.

***

### model

```ts
model: string;
```

Defined in: packages/ai/src/types.ts:1532

***

### signal?

```ts
optional signal?: AbortSignal;
```

Defined in: packages/ai/src/types.ts:1533

***

### systemPrompts?

```ts
optional systemPrompts?: SystemPrompt[];
```

Defined in: packages/ai/src/types.ts:1537

The system prompts of the chat call.

***

### wrapFetch?

```ts
optional wrapFetch?: FetchWrapper;
```

Defined in: packages/ai/src/types.ts:1535

Wraps the fetch of the compaction request.

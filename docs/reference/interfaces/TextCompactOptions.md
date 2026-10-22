---
id: TextCompactOptions
title: TextCompactOptions
---

Defined in: packages/ai/src/types.ts:1530

What `TextAdapter.compact` receives.

## Properties

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: packages/ai/src/types.ts:1532

The history to compact.

***

### model

```ts
model: string;
```

Defined in: packages/ai/src/types.ts:1533

***

### signal?

```ts
optional signal?: AbortSignal;
```

Defined in: packages/ai/src/types.ts:1534

***

### systemPrompts?

```ts
optional systemPrompts?: SystemPrompt[];
```

Defined in: packages/ai/src/types.ts:1538

The system prompts of the chat call.

***

### wrapFetch?

```ts
optional wrapFetch?: FetchWrapper;
```

Defined in: packages/ai/src/types.ts:1536

Wraps the fetch of the compaction request.

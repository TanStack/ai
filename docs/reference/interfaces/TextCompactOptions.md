---
id: TextCompactOptions
title: TextCompactOptions
---

Defined in: [packages/ai/src/types.ts:1540](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1540)

What `TextAdapter.compact` receives.

## Properties

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/types.ts:1542](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1542)

The history to compact.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1543](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1543)

***

### signal?

```ts
optional signal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:1544](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1544)

***

### systemPrompts?

```ts
optional systemPrompts?: SystemPrompt[];
```

Defined in: [packages/ai/src/types.ts:1548](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1548)

The system prompts of the chat call.

***

### wrapFetch?

```ts
optional wrapFetch?: FetchWrapper;
```

Defined in: [packages/ai/src/types.ts:1546](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1546)

Wraps the fetch of the compaction request.

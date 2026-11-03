---
id: TextCompactOptions
title: TextCompactOptions
---

Defined in: [packages/ai/src/types.ts:1570](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1570)

What `TextAdapter.compact` receives.

## Properties

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/types.ts:1572](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1572)

The history to compact.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1573](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1573)

***

### signal?

```ts
optional signal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:1574](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1574)

***

### systemPrompts?

```ts
optional systemPrompts?: SystemPrompt[];
```

Defined in: [packages/ai/src/types.ts:1578](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1578)

The system prompts of the chat call.

***

### wrapFetch?

```ts
optional wrapFetch?: FetchWrapper;
```

Defined in: [packages/ai/src/types.ts:1576](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1576)

Wraps the fetch of the compaction request.

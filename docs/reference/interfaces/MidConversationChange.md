---
id: MidConversationChange
title: MidConversationChange
---

Defined in: [packages/ai/src/types.ts:380](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L380)

The mid-conversation record that `chat()` saves on the first assistant
message of a model call. It holds tool names and prompt hashes only, so it
does not depend on a provider.

## Properties

### systemPrompts?

```ts
optional systemPrompts?: string[];
```

Defined in: [packages/ai/src/types.ts:386](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L386)

Short prompt hashes: every prompt on a start point, the added prompts otherwise.

***

### tools?

```ts
optional tools?: string[];
```

Defined in: [packages/ai/src/types.ts:382](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L382)

A start point: the names of every tool.

***

### toolsAdded?

```ts
optional toolsAdded?: string[];
```

Defined in: [packages/ai/src/types.ts:384](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L384)

Tool names added since the last record.

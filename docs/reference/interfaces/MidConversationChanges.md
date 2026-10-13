---
id: MidConversationChanges
title: MidConversationChanges
---

Defined in: [packages/ai/src/types.ts:393](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L393)

What changed in the tools and system prompts between model calls.
`chat()` passes it in `TextOptions.midConversationChanges`.

## Properties

### changes

```ts
changes: object[];
```

Defined in: [packages/ai/src/types.ts:404](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L404)

Each change goes directly before `messages[before]`, or at the end when
`before === messages.length`. `tools` are the added names.
`systemPrompts` is how many of the next entries of `systemPrompts` it adds.

#### before

```ts
before: number;
```

#### systemPrompts?

```ts
optional systemPrompts?: number;
```

#### tools?

```ts
optional tools?: string[];
```

***

### start

```ts
start: object;
```

Defined in: [packages/ai/src/types.ts:398](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L398)

The tool names of the start point, in start order, and how many entries
at the front of `systemPrompts` belong to it.

#### systemPrompts

```ts
systemPrompts: number;
```

#### tools

```ts
tools: string[];
```

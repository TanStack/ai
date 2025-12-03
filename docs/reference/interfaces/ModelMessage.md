---
id: ModelMessage
title: ModelMessage
---

# Interface: ModelMessage\<TContent\>

Defined in: [types.ts:161](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L161)

## Type Parameters

### TContent

`TContent` *extends* `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[] = `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[]

## Properties

### content

```ts
content: TContent;
```

Defined in: [types.ts:168](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L168)

***

### name?

```ts
optional name: string;
```

Defined in: [types.ts:169](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L169)

***

### role

```ts
role: "user" | "assistant" | "tool";
```

Defined in: [types.ts:167](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L167)

***

### toolCallId?

```ts
optional toolCallId: string;
```

Defined in: [types.ts:171](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L171)

***

### toolCalls?

```ts
optional toolCalls: ToolCall[];
```

Defined in: [types.ts:170](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L170)

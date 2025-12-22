---
id: ModelMessage
title: ModelMessage
---

# Interface: ModelMessage\<TContent\>

Defined in: [types.ts:232](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L232)

## Type Parameters

### TContent

`TContent` *extends* `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[] = `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[]

## Properties

### content

```ts
content: TContent;
```

Defined in: [types.ts:239](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L239)

***

### name?

```ts
optional name: string;
```

Defined in: [types.ts:240](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L240)

***

### role

```ts
role: "user" | "assistant" | "tool";
```

Defined in: [types.ts:238](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L238)

***

### toolCallId?

```ts
optional toolCallId: string;
```

Defined in: [types.ts:242](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L242)

***

### toolCalls?

```ts
optional toolCalls: ToolCall[];
```

Defined in: [types.ts:241](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L241)

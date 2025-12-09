---
id: ModelMessage
title: ModelMessage
---

# Interface: ModelMessage\<TContent\>

Defined in: [types.ts:220](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L220)

## Type Parameters

### TContent

`TContent` *extends* `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[] = `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[]

## Properties

### content

```ts
content: TContent;
```

Defined in: [types.ts:227](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L227)

***

### name?

```ts
optional name: string;
```

Defined in: [types.ts:228](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L228)

***

### role

```ts
role: "user" | "assistant" | "tool";
```

Defined in: [types.ts:226](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L226)

***

### toolCallId?

```ts
optional toolCallId: string;
```

Defined in: [types.ts:230](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L230)

***

### toolCalls?

```ts
optional toolCalls: ToolCall[];
```

Defined in: [types.ts:229](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L229)

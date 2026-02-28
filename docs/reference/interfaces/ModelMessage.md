---
id: ModelMessage
title: ModelMessage
---

# Interface: ModelMessage\<TContent\>

Defined in: [types.ts:260](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L260)

## Type Parameters

### TContent

`TContent` *extends* `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[] = `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[]

## Properties

### content

```ts
content: TContent;
```

Defined in: [types.ts:267](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L267)

***

### name?

```ts
optional name: string;
```

Defined in: [types.ts:268](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L268)

***

### role

```ts
role: "user" | "assistant" | "tool";
```

Defined in: [types.ts:266](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L266)

***

### toolCallId?

```ts
optional toolCallId: string;
```

Defined in: [types.ts:270](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L270)

***

### toolCalls?

```ts
optional toolCalls: ToolCall[];
```

Defined in: [types.ts:269](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L269)

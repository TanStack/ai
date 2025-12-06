---
id: ModelMessage
title: ModelMessage
---

# Interface: ModelMessage\<TContent\>

Defined in: [types.ts:171](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L171)

## Type Parameters

### TContent

`TContent` *extends* `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[] = `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[]

## Properties

### content

```ts
content: TContent;
```

Defined in: [types.ts:178](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L178)

***

### name?

```ts
optional name: string;
```

Defined in: [types.ts:179](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L179)

***

### role

```ts
role: "user" | "assistant" | "tool";
```

Defined in: [types.ts:177](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L177)

***

### toolCallId?

```ts
optional toolCallId: string;
```

Defined in: [types.ts:181](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L181)

***

### toolCalls?

```ts
optional toolCalls: ToolCall[];
```

Defined in: [types.ts:180](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L180)

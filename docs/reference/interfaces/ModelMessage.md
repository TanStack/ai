---
id: ModelMessage
title: ModelMessage
---

# Interface: ModelMessage\<TContent\>

Defined in: [types.ts:159](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L159)

## Type Parameters

### TContent

`TContent` *extends* `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[] = `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[]

## Properties

### content

```ts
content: TContent;
```

Defined in: [types.ts:166](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L166)

***

### name?

```ts
optional name: string;
```

Defined in: [types.ts:167](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L167)

***

### role

```ts
role: "user" | "assistant" | "tool";
```

Defined in: [types.ts:165](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L165)

***

### toolCallId?

```ts
optional toolCallId: string;
```

Defined in: [types.ts:169](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L169)

***

### toolCalls?

```ts
optional toolCalls: ToolCall[];
```

Defined in: [types.ts:168](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L168)

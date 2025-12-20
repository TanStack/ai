---
id: ModelMessage
title: ModelMessage
---

# Interface: ModelMessage\<TContent\>

Defined in: [types.ts:223](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L223)

## Type Parameters

### TContent

`TContent` *extends* `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[] = `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[]

## Properties

### content

```ts
content: TContent;
```

Defined in: [types.ts:230](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L230)

***

### name?

```ts
optional name: string;
```

Defined in: [types.ts:231](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L231)

***

### role

```ts
role: "user" | "assistant" | "tool";
```

Defined in: [types.ts:229](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L229)

***

### toolCallId?

```ts
optional toolCallId: string;
```

Defined in: [types.ts:233](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L233)

***

### toolCalls?

```ts
optional toolCalls: ToolCall[];
```

Defined in: [types.ts:232](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L232)

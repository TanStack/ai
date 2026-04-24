---
id: ModelMessage
title: ModelMessage
---

# Interface: ModelMessage\<TContent\>

Defined in: [packages/typescript/ai/src/types.ts:289](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L289)

## Type Parameters

### TContent

`TContent` *extends* `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[] = `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[]

## Properties

### content

```ts
content: TContent;
```

Defined in: [packages/typescript/ai/src/types.ts:296](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L296)

***

### name?

```ts
optional name: string;
```

Defined in: [packages/typescript/ai/src/types.ts:297](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L297)

***

### role

```ts
role: "user" | "assistant" | "tool";
```

Defined in: [packages/typescript/ai/src/types.ts:295](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L295)

***

### toolCallId?

```ts
optional toolCallId: string;
```

Defined in: [packages/typescript/ai/src/types.ts:299](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L299)

***

### toolCalls?

```ts
optional toolCalls: ToolCall[];
```

Defined in: [packages/typescript/ai/src/types.ts:298](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L298)

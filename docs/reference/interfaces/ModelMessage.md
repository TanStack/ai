---
id: ModelMessage
title: ModelMessage
---

# Interface: ModelMessage\<TContent\>

Defined in: [types.ts:283](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L283)

## Type Parameters

### TContent

`TContent` *extends* `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[] = `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[]

## Properties

### content

```ts
content: TContent;
```

Defined in: [types.ts:290](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L290)

***

### name?

```ts
optional name: string;
```

Defined in: [types.ts:291](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L291)

***

### role

```ts
role: "user" | "assistant" | "tool";
```

Defined in: [types.ts:289](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L289)

***

### toolCallId?

```ts
optional toolCallId: string;
```

Defined in: [types.ts:293](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L293)

***

### toolCalls?

```ts
optional toolCalls: ToolCall[];
```

Defined in: [types.ts:292](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L292)

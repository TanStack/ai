---
id: ModelMessage
title: ModelMessage
---

# Interface: ModelMessage\<TContent\>

Defined in: [types.ts:166](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L166)

## Type Parameters

### TContent

`TContent` *extends* `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[] = `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[]

## Properties

### content

```ts
content: TContent;
```

Defined in: [types.ts:173](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L173)

***

### name?

```ts
optional name: string;
```

Defined in: [types.ts:174](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L174)

***

### role

```ts
role: "user" | "assistant" | "tool";
```

Defined in: [types.ts:172](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L172)

***

### toolCallId?

```ts
optional toolCallId: string;
```

Defined in: [types.ts:176](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L176)

***

### toolCalls?

```ts
optional toolCalls: ToolCall[];
```

Defined in: [types.ts:175](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L175)

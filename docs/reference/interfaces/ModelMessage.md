---
id: ModelMessage
title: ModelMessage
---

# Interface: ModelMessage\<TContent\>

Defined in: [packages/ai/src/types.ts:325](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L325)

## Type Parameters

### TContent

`TContent` *extends* `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[] = `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[]

## Properties

### content

```ts
content: TContent;
```

Defined in: [packages/ai/src/types.ts:332](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L332)

***

### name?

```ts
optional name: string;
```

Defined in: [packages/ai/src/types.ts:333](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L333)

***

### role

```ts
role: "user" | "assistant" | "tool";
```

Defined in: [packages/ai/src/types.ts:331](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L331)

***

### thinking?

```ts
optional thinking: object[];
```

Defined in: [packages/ai/src/types.ts:336](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L336)

#### content

```ts
content: string;
```

#### signature?

```ts
optional signature: string;
```

***

### toolCallId?

```ts
optional toolCallId: string;
```

Defined in: [packages/ai/src/types.ts:335](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L335)

***

### toolCalls?

```ts
optional toolCalls: ToolCall<unknown>[];
```

Defined in: [packages/ai/src/types.ts:334](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L334)

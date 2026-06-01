---
id: ModelMessage
title: ModelMessage
---

# Interface: ModelMessage\<TContent\>

Defined in: [packages/ai/src/types.ts:315](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L315)

## Type Parameters

### TContent

`TContent` *extends* `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[] = `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[]

## Properties

### content

```ts
content: TContent;
```

Defined in: [packages/ai/src/types.ts:322](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L322)

***

### name?

```ts
optional name: string;
```

Defined in: [packages/ai/src/types.ts:323](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L323)

***

### role

```ts
role: "user" | "assistant" | "tool";
```

Defined in: [packages/ai/src/types.ts:321](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L321)

***

### thinking?

```ts
optional thinking: object[];
```

Defined in: [packages/ai/src/types.ts:326](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L326)

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

Defined in: [packages/ai/src/types.ts:325](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L325)

***

### toolCalls?

```ts
optional toolCalls: ToolCall<unknown>[];
```

Defined in: [packages/ai/src/types.ts:324](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L324)

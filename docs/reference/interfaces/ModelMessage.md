---
id: ModelMessage
title: ModelMessage
---

# Interface: ModelMessage\<TContent\>

Defined in: [packages/ai/src/types.ts:347](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L347)

## Type Parameters

### TContent

`TContent` *extends* `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[] = `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[]

## Properties

### content

```ts
content: TContent;
```

Defined in: [packages/ai/src/types.ts:354](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L354)

***

### name?

```ts
optional name: string;
```

Defined in: [packages/ai/src/types.ts:355](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L355)

***

### role

```ts
role: "user" | "assistant" | "tool";
```

Defined in: [packages/ai/src/types.ts:353](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L353)

***

### thinking?

```ts
optional thinking: object[];
```

Defined in: [packages/ai/src/types.ts:358](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L358)

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

Defined in: [packages/ai/src/types.ts:357](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L357)

***

### toolCalls?

```ts
optional toolCalls: ToolCall<unknown>[];
```

Defined in: [packages/ai/src/types.ts:356](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L356)

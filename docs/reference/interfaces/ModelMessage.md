---
id: ModelMessage
title: ModelMessage
---

# Interface: ModelMessage\<TContent\>

Defined in: [packages/typescript/ai/src/types.ts:313](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L313)

## Type Parameters

### TContent

`TContent` *extends* `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[] = `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[]

## Properties

### content

```ts
content: TContent;
```

Defined in: [packages/typescript/ai/src/types.ts:320](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L320)

***

### name?

```ts
optional name: string;
```

Defined in: [packages/typescript/ai/src/types.ts:321](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L321)

***

### role

```ts
role: "user" | "assistant" | "tool";
```

Defined in: [packages/typescript/ai/src/types.ts:319](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L319)

***

### thinking?

```ts
optional thinking: object[];
```

Defined in: [packages/typescript/ai/src/types.ts:324](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L324)

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

Defined in: [packages/typescript/ai/src/types.ts:323](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L323)

***

### toolCalls?

```ts
optional toolCalls: ToolCall<unknown>[];
```

Defined in: [packages/typescript/ai/src/types.ts:322](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L322)

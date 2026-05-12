---
id: ModelMessage
title: ModelMessage
---

# Interface: ModelMessage\<TContent\>

Defined in: [packages/typescript/ai/src/types.ts:291](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L291)

## Type Parameters

### TContent

`TContent` *extends* `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[] = `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[]

## Properties

### content

```ts
content: TContent;
```

Defined in: [packages/typescript/ai/src/types.ts:298](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L298)

***

### name?

```ts
optional name: string;
```

Defined in: [packages/typescript/ai/src/types.ts:299](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L299)

***

### role

```ts
role: "user" | "assistant" | "tool";
```

Defined in: [packages/typescript/ai/src/types.ts:297](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L297)

***

### thinking?

```ts
optional thinking: object[];
```

Defined in: [packages/typescript/ai/src/types.ts:302](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L302)

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

Defined in: [packages/typescript/ai/src/types.ts:301](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L301)

***

### toolCalls?

```ts
optional toolCalls: ToolCall<unknown>[];
```

Defined in: [packages/typescript/ai/src/types.ts:300](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L300)

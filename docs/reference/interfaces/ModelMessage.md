---
id: ModelMessage
title: ModelMessage
---

# Interface: ModelMessage\<TContent\>

Defined in: [packages/typescript/ai/src/types.ts:312](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L312)

## Type Parameters

### TContent

`TContent` *extends* `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[] = `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[]

## Properties

### content

```ts
content: TContent;
```

Defined in: [packages/typescript/ai/src/types.ts:319](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L319)

***

### name?

```ts
optional name: string;
```

Defined in: [packages/typescript/ai/src/types.ts:320](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L320)

***

### role

```ts
role: "user" | "assistant" | "tool";
```

Defined in: [packages/typescript/ai/src/types.ts:318](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L318)

***

### thinking?

```ts
optional thinking: object[];
```

Defined in: [packages/typescript/ai/src/types.ts:323](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L323)

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

Defined in: [packages/typescript/ai/src/types.ts:322](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L322)

***

### toolCalls?

```ts
optional toolCalls: ToolCall<unknown>[];
```

Defined in: [packages/typescript/ai/src/types.ts:321](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L321)

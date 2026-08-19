---
id: ModelMessage
title: ModelMessage
---

# Interface: ModelMessage\<TContent\>

Defined in: [packages/ai/src/types.ts:358](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L358)

## Type Parameters

### TContent

`TContent` *extends* `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[] = `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[]

## Properties

### content

```ts
content: TContent;
```

Defined in: [packages/ai/src/types.ts:365](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L365)

***

### createdAt?

```ts
optional createdAt?: Date;
```

Defined in: [packages/ai/src/types.ts:391](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L391)

Optional message creation timestamp. When present, message converters
preserve it across persist → hydrate round-trips.

***

### id?

```ts
optional id?: string;
```

Defined in: [packages/ai/src/types.ts:386](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L386)

Optional stable message id. Providers ignore it; it exists so a persisted
transcript can retain the streaming `messageId` and survive the
persist → hydrate round-trip. When present, `modelMessagesToUIMessages`
reuses it instead of generating a fresh id, so a hydrated message keeps the
same identity as its live stream — which is what lets a mid-stream reload
resume the SAME message bubble in place (see `@tanstack/ai-persistence`).

***

### name?

```ts
optional name?: string;
```

Defined in: [packages/ai/src/types.ts:366](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L366)

***

### role

```ts
role: "user" | "assistant" | "tool";
```

Defined in: [packages/ai/src/types.ts:364](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L364)

***

### structuredOutput?

```ts
optional structuredOutput?: StructuredOutputPart<unknown>;
```

Defined in: [packages/ai/src/types.ts:377](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L377)

Completed structured output represented by this assistant message.
`content` remains the provider-facing JSON text; this field preserves the
typed UI part across persistence and message conversion.

***

### thinking?

```ts
optional thinking?: object[];
```

Defined in: [packages/ai/src/types.ts:369](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L369)

#### content

```ts
content: string;
```

#### signature?

```ts
optional signature?: string;
```

***

### toolCallId?

```ts
optional toolCallId?: string;
```

Defined in: [packages/ai/src/types.ts:368](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L368)

***

### toolCalls?

```ts
optional toolCalls?: ToolCall<unknown>[];
```

Defined in: [packages/ai/src/types.ts:367](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L367)

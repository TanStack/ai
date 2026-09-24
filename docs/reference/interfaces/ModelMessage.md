---
id: ModelMessage
title: ModelMessage
---

Defined in: [packages/ai/src/types.ts:345](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L345)

## Type Parameters

### TContent

`TContent` *extends* `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[] = `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[]

## Properties

### content

```ts
content: TContent;
```

Defined in: [packages/ai/src/types.ts:352](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L352)

***

### createdAt?

```ts
optional createdAt?: Date;
```

Defined in: [packages/ai/src/types.ts:380](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L380)

Optional message creation timestamp. When present, message converters
preserve it across persist → hydrate round-trips.

***

### error?

```ts
optional error?: string;
```

Defined in: [packages/ai/src/types.ts:358](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L358)

Error reported by an AG-UI tool message.

***

### id?

```ts
optional id?: string;
```

Defined in: [packages/ai/src/types.ts:375](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L375)

Optional stable message id. Providers ignore it; it exists so a persisted
transcript can retain the streaming `messageId` and survive the
persist → hydrate round-trip. When present, `modelMessagesToUIMessages`
reuses it instead of generating a fresh id, so a hydrated message keeps the
same identity as its live stream — which is what lets a mid-stream reload
resume the SAME message bubble in place (see `@tanstack/ai-persistence`).

***

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:360](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L360)

Optional AG-UI message metadata. TanStack-owned fields live under `tanstack`.

***

### name?

```ts
optional name?: string;
```

Defined in: [packages/ai/src/types.ts:353](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L353)

***

### role

```ts
role: "assistant" | "user" | "tool";
```

Defined in: [packages/ai/src/types.ts:351](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L351)

***

### structuredOutput?

```ts
optional structuredOutput?: StructuredOutputPart<unknown>;
```

Defined in: [packages/ai/src/types.ts:366](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L366)

Completed structured output represented by this assistant message.
`content` remains the provider-facing JSON text; this field preserves the
typed UI part across persistence and message conversion.

***

### thinking?

```ts
optional thinking?: object[];
```

Defined in: [packages/ai/src/types.ts:356](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L356)

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

Defined in: [packages/ai/src/types.ts:355](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L355)

***

### toolCalls?

```ts
optional toolCalls?: ToolCall<unknown>[];
```

Defined in: [packages/ai/src/types.ts:354](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L354)

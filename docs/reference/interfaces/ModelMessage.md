---
id: ModelMessage
title: ModelMessage
---

Defined in: [packages/ai/src/types.ts:374](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L374)

## Type Parameters

### TContent

`TContent` *extends* `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[] = `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[]

## Properties

### content

```ts
content: TContent;
```

Defined in: [packages/ai/src/types.ts:381](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L381)

***

### createdAt?

```ts
optional createdAt?: Date;
```

Defined in: [packages/ai/src/types.ts:414](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L414)

Optional message creation timestamp. When present, message converters
preserve it across persist → hydrate round-trips.

***

### error?

```ts
optional error?: string;
```

Defined in: [packages/ai/src/types.ts:392](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L392)

Error reported by an AG-UI tool message.

***

### id?

```ts
optional id?: string;
```

Defined in: [packages/ai/src/types.ts:409](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L409)

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

Defined in: [packages/ai/src/types.ts:394](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L394)

Optional AG-UI message metadata. TanStack-owned fields live under `tanstack`.

***

### name?

```ts
optional name?: string;
```

Defined in: [packages/ai/src/types.ts:382](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L382)

***

### role

```ts
role: "assistant" | "user" | "tool";
```

Defined in: [packages/ai/src/types.ts:380](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L380)

***

### structuredOutput?

```ts
optional structuredOutput?: StructuredOutputPart<unknown>;
```

Defined in: [packages/ai/src/types.ts:400](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L400)

Completed structured output represented by this assistant message.
`content` remains the provider-facing JSON text; this field preserves the
typed UI part across persistence and message conversion.

***

### thinking?

```ts
optional thinking?: object[];
```

Defined in: [packages/ai/src/types.ts:390](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L390)

Signed thinking to send back to the provider. `redacted: true` marks a
block the provider encrypted: `content` is empty and `signature` holds its
opaque data. See `ThinkingPart.signature` for the planned rename.

#### content

```ts
content: string;
```

#### redacted?

```ts
optional redacted?: boolean;
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

Defined in: [packages/ai/src/types.ts:384](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L384)

***

### toolCalls?

```ts
optional toolCalls?: ToolCall<unknown>[];
```

Defined in: [packages/ai/src/types.ts:383](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L383)

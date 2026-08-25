---
id: ModelMessage
title: ModelMessage
---

# Interface: ModelMessage\<TContent\>

Defined in: [packages/ai/src/types.ts:363](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L363)

## Type Parameters

### TContent

`TContent` *extends* `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[] = `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[]

## Properties

### content

```ts
content: TContent;
```

Defined in: [packages/ai/src/types.ts:370](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L370)

***

### createdAt?

```ts
optional createdAt?: Date;
```

Defined in: [packages/ai/src/types.ts:398](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L398)

Optional message creation timestamp. When present, message converters
preserve it across persist → hydrate round-trips.

***

### error?

```ts
optional error?: string;
```

Defined in: [packages/ai/src/types.ts:376](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L376)

Error reported by an AG-UI tool message.

***

### id?

```ts
optional id?: string;
```

Defined in: [packages/ai/src/types.ts:393](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L393)

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

Defined in: [packages/ai/src/types.ts:378](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L378)

Optional AG-UI message metadata. TanStack-owned fields live under `tanstack`.

***

### name?

```ts
optional name?: string;
```

Defined in: [packages/ai/src/types.ts:371](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L371)

***

### role

```ts
role: "user" | "assistant" | "tool";
```

Defined in: [packages/ai/src/types.ts:369](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L369)

***

### structuredOutput?

```ts
optional structuredOutput?: StructuredOutputPart<unknown>;
```

Defined in: [packages/ai/src/types.ts:384](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L384)

Completed structured output represented by this assistant message.
`content` remains the provider-facing JSON text; this field preserves the
typed UI part across persistence and message conversion.

***

### thinking?

```ts
optional thinking?: object[];
```

Defined in: [packages/ai/src/types.ts:374](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L374)

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

Defined in: [packages/ai/src/types.ts:373](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L373)

***

### toolCalls?

```ts
optional toolCalls?: ToolCall<unknown>[];
```

Defined in: [packages/ai/src/types.ts:372](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L372)

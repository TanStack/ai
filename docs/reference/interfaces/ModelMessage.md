---
id: ModelMessage
title: ModelMessage
---

Defined in: [packages/ai/src/types.ts:428](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L428)

## Type Parameters

### TContent

`TContent` *extends* `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[] = `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[]

## Properties

### blockOrder?

```ts
optional blockOrder?: ModelMessageBlock[];
```

Defined in: [packages/ai/src/types.ts:452](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L452)

The order of the blocks of an assistant message, when it is not the
default order (all thinking, then the text, then the tool calls). Each
entry points into `thinking`, into `content` (a string, by UTF-16 length),
or into `toolCalls`. The library writes and reads this field. A reader
that finds a map that does not match the message uses the default order.

***

### content

```ts
content: TContent;
```

Defined in: [packages/ai/src/types.ts:435](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L435)

***

### createdAt?

```ts
optional createdAt?: Date;
```

Defined in: [packages/ai/src/types.ts:482](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L482)

Optional message creation timestamp. When present, message converters
preserve it across persist → hydrate round-trips.

***

### error?

```ts
optional error?: string;
```

Defined in: [packages/ai/src/types.ts:454](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L454)

Error reported by an AG-UI tool message.

***

### id?

```ts
optional id?: string;
```

Defined in: [packages/ai/src/types.ts:477](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L477)

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

Defined in: [packages/ai/src/types.ts:462](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L462)

Optional AG-UI message metadata. TanStack-owned fields live under `tanstack`.

***

### midConversationChange?

```ts
optional midConversationChange?: MidConversationChange;
```

Defined in: [packages/ai/src/types.ts:460](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L460)

The tools and system prompts that changed before this assistant message.
`chat()` writes it when the adapter has a mid-conversation channel.
Providers ignore it: adapters read `TextOptions.midConversationChanges`.

***

### name?

```ts
optional name?: string;
```

Defined in: [packages/ai/src/types.ts:436](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L436)

***

### role

```ts
role: "assistant" | "user" | "tool";
```

Defined in: [packages/ai/src/types.ts:434](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L434)

***

### structuredOutput?

```ts
optional structuredOutput?: StructuredOutputPart<unknown>;
```

Defined in: [packages/ai/src/types.ts:468](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L468)

Completed structured output represented by this assistant message.
`content` remains the provider-facing JSON text; this field preserves the
typed UI part across persistence and message conversion.

***

### thinking?

```ts
optional thinking?: object[];
```

Defined in: [packages/ai/src/types.ts:444](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L444)

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

Defined in: [packages/ai/src/types.ts:438](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L438)

***

### toolCalls?

```ts
optional toolCalls?: ToolCall<unknown>[];
```

Defined in: [packages/ai/src/types.ts:437](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L437)

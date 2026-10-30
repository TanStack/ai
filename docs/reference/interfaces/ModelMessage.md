---
id: ModelMessage
title: ModelMessage
---

Defined in: [packages/ai/src/types.ts:431](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L431)

## Type Parameters

### TContent

`TContent` *extends* `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[] = `string` \| `null` \| [`ContentPart`](../type-aliases/ContentPart.md)[]

## Properties

### blockOrder?

```ts
optional blockOrder?: ModelMessageBlock[];
```

Defined in: [packages/ai/src/types.ts:455](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L455)

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

Defined in: [packages/ai/src/types.ts:438](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L438)

***

### createdAt?

```ts
optional createdAt?: Date;
```

Defined in: [packages/ai/src/types.ts:485](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L485)

Optional message creation timestamp. When present, message converters
preserve it across persist → hydrate round-trips.

***

### error?

```ts
optional error?: string;
```

Defined in: [packages/ai/src/types.ts:457](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L457)

Error reported by an AG-UI tool message.

***

### id?

```ts
optional id?: string;
```

Defined in: [packages/ai/src/types.ts:480](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L480)

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

Defined in: [packages/ai/src/types.ts:465](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L465)

Optional AG-UI message metadata. TanStack-owned fields live under `tanstack`.

***

### midConversationChange?

```ts
optional midConversationChange?: MidConversationChange;
```

Defined in: [packages/ai/src/types.ts:463](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L463)

The tools and system prompts that changed before this assistant message.
`chat()` writes it when the adapter has a mid-conversation channel.
Providers ignore it: adapters read `TextOptions.midConversationChanges`.

***

### name?

```ts
optional name?: string;
```

Defined in: [packages/ai/src/types.ts:439](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L439)

***

### role

```ts
role: "assistant" | "user" | "tool";
```

Defined in: [packages/ai/src/types.ts:437](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L437)

***

### structuredOutput?

```ts
optional structuredOutput?: StructuredOutputPart<unknown>;
```

Defined in: [packages/ai/src/types.ts:471](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L471)

Completed structured output represented by this assistant message.
`content` remains the provider-facing JSON text; this field preserves the
typed UI part across persistence and message conversion.

***

### thinking?

```ts
optional thinking?: object[];
```

Defined in: [packages/ai/src/types.ts:447](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L447)

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

Defined in: [packages/ai/src/types.ts:441](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L441)

***

### toolCalls?

```ts
optional toolCalls?: ToolCall<unknown>[];
```

Defined in: [packages/ai/src/types.ts:440](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L440)

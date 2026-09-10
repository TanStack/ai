---
id: ChatMiddlewareConfig
title: ChatMiddlewareConfig
---

# Interface: ChatMiddlewareConfig

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:313](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L313)

Chat configuration that middleware can observe or transform.
This is a subset of the chat engine's effective configuration
that middleware is allowed to modify.

## Properties

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:315](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L315)

Canonical conversation history. Middleware and persistence read this.

***

### metadata?

```ts
optional metadata?: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:322](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L322)

***

### modelOptions?

```ts
optional modelOptions?: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:323](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L323)

***

### providerMessages?

```ts
optional providerMessages?: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:317](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L317)

Provider-only context. Defaults to `messages` when it is not set.

***

### resume?

```ts
optional resume?: RunAgentResumeItem[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:320](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L320)

***

### resumeToolState?

```ts
optional resumeToolState?: ChatResumeToolState;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:321](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L321)

***

### systemPrompts

```ts
systemPrompts: SystemPrompt[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:318](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L318)

***

### tools

```ts
tools: Tool<SchemaInput, SchemaInput, string, unknown>[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:319](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L319)

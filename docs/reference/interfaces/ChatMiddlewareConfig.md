---
id: ChatMiddlewareConfig
title: ChatMiddlewareConfig
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:326](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L326)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:328](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L328)

Canonical conversation history. Middleware and persistence read this.

***

### metadata?

```ts
optional metadata?: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:335](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L335)

***

### modelOptions?

```ts
optional modelOptions?: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:336](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L336)

***

### providerMessages?

```ts
optional providerMessages?: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:330](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L330)

Provider-only context. Defaults to `messages` when it is not set.

***

### resume?

```ts
optional resume?: RunAgentResumeItem[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:333](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L333)

***

### resumeToolState?

```ts
optional resumeToolState?: ChatResumeToolState;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:334](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L334)

***

### systemPrompts

```ts
systemPrompts: SystemPrompt[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:331](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L331)

***

### tools

```ts
tools: Tool<SchemaInput, SchemaInput, string, unknown>[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:332](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L332)

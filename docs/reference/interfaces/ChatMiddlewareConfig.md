---
id: ChatMiddlewareConfig
title: ChatMiddlewareConfig
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:319](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L319)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:321](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L321)

Canonical conversation history. Middleware and persistence read this.

***

### metadata?

```ts
optional metadata?: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:328](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L328)

***

### modelOptions?

```ts
optional modelOptions?: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:329](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L329)

***

### providerMessages?

```ts
optional providerMessages?: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:323](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L323)

Provider-only context. Defaults to `messages` when it is not set.

***

### resume?

```ts
optional resume?: RunAgentResumeItem[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:326](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L326)

***

### resumeToolState?

```ts
optional resumeToolState?: ChatResumeToolState;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:327](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L327)

***

### systemPrompts

```ts
systemPrompts: SystemPrompt[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:324](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L324)

***

### tools

```ts
tools: Tool<SchemaInput, SchemaInput, string, unknown>[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:325](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L325)

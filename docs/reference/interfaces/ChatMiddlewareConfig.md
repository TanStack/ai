---
id: ChatMiddlewareConfig
title: ChatMiddlewareConfig
---

# Interface: ChatMiddlewareConfig

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:212](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L212)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:213](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L213)

***

### metadata?

```ts
optional metadata?: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:218](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L218)

***

### modelOptions?

```ts
optional modelOptions?: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:219](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L219)

***

### resume?

```ts
optional resume?: ResumeEntry[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:216](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L216)

***

### resumeToolState?

```ts
optional resumeToolState?: ChatResumeToolState;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:217](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L217)

***

### systemPrompts

```ts
systemPrompts: SystemPrompt[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:214](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L214)

***

### tools

```ts
tools: Tool<SchemaInput, SchemaInput, string, unknown>[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:215](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L215)

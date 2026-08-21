---
id: ChatMiddlewareConfig
title: ChatMiddlewareConfig
---

# Interface: ChatMiddlewareConfig

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:307](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L307)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:308](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L308)

***

### metadata?

```ts
optional metadata?: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:313](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L313)

***

### modelOptions?

```ts
optional modelOptions?: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:314](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L314)

***

### resume?

```ts
optional resume?: RunAgentResumeItem[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:311](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L311)

***

### resumeToolState?

```ts
optional resumeToolState?: ChatResumeToolState;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:312](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L312)

***

### systemPrompts

```ts
systemPrompts: SystemPrompt[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:309](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L309)

***

### tools

```ts
tools: Tool<SchemaInput, SchemaInput, string, unknown>[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:310](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L310)

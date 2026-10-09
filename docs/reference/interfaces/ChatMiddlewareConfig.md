---
id: ChatMiddlewareConfig
title: ChatMiddlewareConfig
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:334](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L334)

Chat configuration that middleware can observe or transform.
This is a subset of the chat engine's effective configuration
that middleware is allowed to modify.

## Properties

### activities?

```ts
optional activities?: ActivityRecord[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:341](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L341)

Frontend-only AG-UI activity sidecar. Persistence loads and saves this
when an ActivityStore is configured. Never model input.

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:336](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L336)

Canonical conversation history. Middleware and persistence read this.

***

### metadata?

```ts
optional metadata?: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:348](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L348)

***

### modelOptions?

```ts
optional modelOptions?: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:349](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L349)

***

### providerMessages?

```ts
optional providerMessages?: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:343](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L343)

Provider-only context. Defaults to `messages` when it is not set.

***

### resume?

```ts
optional resume?: RunAgentResumeItem[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:346](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L346)

***

### resumeToolState?

```ts
optional resumeToolState?: ChatResumeToolState;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:347](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L347)

***

### systemPrompts

```ts
systemPrompts: SystemPrompt[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:344](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L344)

***

### tools

```ts
tools: Tool<SchemaInput, SchemaInput, string, unknown>[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:345](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L345)

***

### wrapFetch?

```ts
optional wrapFetch?: FetchWrapper;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:355](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L355)

Wraps the fetch of the next model call. A returned wrapper chains inside
the wrappers before it, so it does not replace them. It applies to that
call only. The next call starts again from the `chat()` option.

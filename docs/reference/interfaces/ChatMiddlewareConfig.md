---
id: ChatMiddlewareConfig
title: ChatMiddlewareConfig
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:337](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L337)

Chat configuration that middleware can observe or transform.
This is a subset of the chat engine's effective configuration
that middleware is allowed to modify.

## Properties

### activities?

```ts
optional activities?: ActivityRecord[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:344](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L344)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:339](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L339)

Canonical conversation history. Middleware and persistence read this.

***

### metadata?

```ts
optional metadata?: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:351](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L351)

***

### modelOptions?

```ts
optional modelOptions?: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:352](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L352)

***

### promptCache?

```ts
optional promptCache?: ResolvedPromptCache;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:365](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L365)

The prompt cache of the next model call. A returned value stays until a
middleware changes it.

***

### providerMessages?

```ts
optional providerMessages?: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:346](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L346)

Provider-only context. Defaults to `messages` when it is not set.

***

### reasoning?

```ts
optional reasoning?: ReasoningRequest;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:354](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L354)

How hard the model thinks at this call. A middleware can set or change it.

***

### resume?

```ts
optional resume?: RunAgentResumeItem[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:349](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L349)

***

### resumeToolState?

```ts
optional resumeToolState?: ChatResumeToolState;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:350](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L350)

***

### systemPrompts

```ts
systemPrompts: SystemPrompt[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:347](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L347)

***

### toolChoice?

```ts
optional toolChoice?: ToolChoice;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:360](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L360)

How the model uses the tools of the next model call. A returned value
applies to that call only. The next call starts again from the `chat()`
option. A call with no tools sends no tool choice.

***

### tools

```ts
tools: Tool<SchemaInput, SchemaInput, string, unknown>[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:348](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L348)

***

### wrapFetch?

```ts
optional wrapFetch?: FetchWrapper;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:371](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L371)

Wraps the fetch of the next model call. A returned wrapper chains inside
the wrappers before it, so it does not replace them. It applies to that
call only. The next call starts again from the `chat()` option.

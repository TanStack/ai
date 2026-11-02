---
id: ChatMiddlewareConfig
title: ChatMiddlewareConfig
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:354](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L354)

Chat configuration that middleware can observe or transform.
This is a subset of the chat engine's effective configuration
that middleware is allowed to modify.

## Properties

### activities?

```ts
optional activities?: ActivityRecord[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:361](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L361)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:356](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L356)

Canonical conversation history. Middleware and persistence read this.

***

### metadata?

```ts
optional metadata?: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:368](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L368)

***

### modelOptions?

```ts
optional modelOptions?: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:369](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L369)

***

### promptCache?

```ts
optional promptCache?: ResolvedPromptCache;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:382](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L382)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:363](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L363)

Provider-only context. Defaults to `messages` when it is not set.

***

### reasoning?

```ts
optional reasoning?: ReasoningRequest;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:371](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L371)

How hard the model thinks at this call. A middleware can set or change it.

***

### resume?

```ts
optional resume?: RunAgentResumeItem[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:366](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L366)

***

### resumeToolState?

```ts
optional resumeToolState?: ChatResumeToolState;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:367](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L367)

***

### systemPrompts

```ts
systemPrompts: SystemPrompt[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:364](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L364)

***

### toolChoice?

```ts
optional toolChoice?: ToolChoice;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:377](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L377)

How the model uses the tools of the next model call. A returned value
applies to that call only. The next call starts again from the `chat()`
option. A call with no tools sends no tool choice.

***

### tools

```ts
tools: Tool<SchemaInput, SchemaInput, string, unknown>[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:365](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L365)

***

### wrapFetch?

```ts
optional wrapFetch?: FetchWrapper;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:388](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L388)

Wraps the fetch of the next model call. A returned wrapper chains inside
the wrappers before it, so it does not replace them. It applies to that
call only. The next call starts again from the `chat()` option.

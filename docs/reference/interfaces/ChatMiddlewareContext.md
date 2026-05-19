---
id: ChatMiddlewareContext
title: ChatMiddlewareContext
---

# Interface: ChatMiddlewareContext

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:27](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L27)

Stable context object passed to all middleware hooks.
Created once per chat() invocation and shared across all hooks.

## Properties

### abort()

```ts
abort: (reason?) => void;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:54](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L54)

Abort the chat run with a reason

#### Parameters

##### reason?

`string`

#### Returns

`void`

***

### accumulatedContent

```ts
accumulatedContent: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:98](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L98)

Accumulated text content for the current iteration

***

### chunkIndex

```ts
chunkIndex: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:50](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L50)

Running count of chunks yielded so far

***

### context

```ts
context: unknown;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:56](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L56)

Opaque user-provided value from chat() options

***

### ~~conversationId?~~

```ts
optional conversationId: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:44](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L44)

#### Deprecated

Use `threadId` instead. Retained as an alias of
`threadId` so middleware written before the AG-UI rename keeps
working unchanged. Will be removed in a future major release.

***

### createId()

```ts
createId: (prefix) => string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:105](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L105)

Generate a unique ID with the given prefix

#### Parameters

##### prefix

`string`

#### Returns

`string`

***

### currentMessageId

```ts
currentMessageId: string | null;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:96](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L96)

Current assistant message ID (changes per iteration)

***

### defer()

```ts
defer: (promise) => void;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:62](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L62)

Defer a non-blocking side-effect promise.
Deferred promises do not block streaming and are awaited
after the terminal hook (onFinish/onAbort/onError).

#### Parameters

##### promise

`Promise`\<`unknown`\>

#### Returns

`void`

***

### hasTools

```ts
hasTools: boolean;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:91](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L91)

Whether tools are configured

***

### iteration

```ts
iteration: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:48](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L48)

Current agent loop iteration (0-indexed)

***

### messageCount

```ts
messageCount: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:89](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L89)

Number of messages at the start of the request

***

### messages

```ts
messages: readonly ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:103](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L103)

Current messages array (read-only view)

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:69](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L69)

Model identifier (e.g., 'gpt-4o')

***

### modelOptions?

```ts
optional modelOptions: Record<string, unknown>;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:84](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L84)

Provider-specific model options

***

### options?

```ts
optional options: Record<string, unknown>;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:82](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L82)

Flattened generation options (temperature, topP, maxTokens, metadata)

***

### phase

```ts
phase: ChatMiddlewarePhase;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:46](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L46)

Current lifecycle phase

***

### provider

```ts
provider: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:67](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L67)

Provider name (e.g., 'openai', 'anthropic')

***

### requestId

```ts
requestId: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:29](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L29)

Unique identifier for this chat request

***

### signal?

```ts
optional signal: AbortSignal;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:52](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L52)

Abort signal from the chat request

***

### source

```ts
source: "client" | "server";
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:71](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L71)

Source of the chat invocation — always 'server' for server-side chat

***

### streamId

```ts
streamId: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:31](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L31)

Unique identifier for this stream

***

### streaming

```ts
streaming: boolean;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:73](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L73)

Whether the chat is streaming

***

### systemPrompts

```ts
systemPrompts: SystemPrompt[];
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:78](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L78)

System prompts configured for this chat

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:38](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L38)

AG-UI thread identifier — a stable per-conversation ID used to
correlate client and server devtools events. Resolves to the
caller-provided `threadId` (or legacy `conversationId`), or an
auto-generated value when neither is supplied.

***

### toolNames?

```ts
optional toolNames: string[];
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:80](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L80)

Names of configured tools, if any

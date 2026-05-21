---
id: ChatMiddlewareContext
title: ChatMiddlewareContext
---

# Interface: ChatMiddlewareContext

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:36](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L36)

Stable context object passed to all middleware hooks.
Created once per chat() invocation and shared across all hooks.

## Properties

### abort()

```ts
abort: (reason?) => void;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:63](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L63)

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

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:107](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L107)

Accumulated text content for the current iteration

***

### chunkIndex

```ts
chunkIndex: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:59](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L59)

Running count of chunks yielded so far

***

### context

```ts
context: unknown;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:65](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L65)

Opaque user-provided value from chat() options

***

### ~~conversationId?~~

```ts
optional conversationId: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:53](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L53)

#### Deprecated

Use `threadId` instead. Retained as an alias of
`threadId` so middleware written before the AG-UI rename keeps
working unchanged. Will be removed in a future major release.

***

### createId()

```ts
createId: (prefix) => string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:114](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L114)

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

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:105](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L105)

Current assistant message ID (changes per iteration)

***

### defer()

```ts
defer: (promise) => void;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:71](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L71)

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

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:100](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L100)

Whether tools are configured

***

### iteration

```ts
iteration: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:57](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L57)

Current agent loop iteration (0-indexed)

***

### messageCount

```ts
messageCount: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:98](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L98)

Number of messages at the start of the request

***

### messages

```ts
messages: readonly ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:112](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L112)

Current messages array (read-only view)

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:78](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L78)

Model identifier (e.g., 'gpt-4o')

***

### modelOptions?

```ts
optional modelOptions: Record<string, unknown>;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:93](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L93)

Provider-specific model options

***

### options?

```ts
optional options: Record<string, unknown>;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:91](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L91)

Flattened generation options (temperature, topP, maxTokens, metadata)

***

### phase

```ts
phase: ChatMiddlewarePhase;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:55](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L55)

Current lifecycle phase

***

### provider

```ts
provider: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:76](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L76)

Provider name (e.g., 'openai', 'anthropic')

***

### requestId

```ts
requestId: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:38](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L38)

Unique identifier for this chat request

***

### signal?

```ts
optional signal: AbortSignal;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:61](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L61)

Abort signal from the chat request

***

### source

```ts
source: "client" | "server";
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:80](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L80)

Source of the chat invocation — always 'server' for server-side chat

***

### streamId

```ts
streamId: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:40](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L40)

Unique identifier for this stream

***

### streaming

```ts
streaming: boolean;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:82](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L82)

Whether the chat is streaming

***

### systemPrompts

```ts
systemPrompts: SystemPrompt[];
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:87](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L87)

System prompts configured for this chat

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:47](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L47)

AG-UI thread identifier — a stable per-conversation ID used to
correlate client and server devtools events. Resolves to the
caller-provided `threadId` (or legacy `conversationId`), or an
auto-generated value when neither is supplied.

***

### toolNames?

```ts
optional toolNames: string[];
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:89](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L89)

Names of configured tools, if any

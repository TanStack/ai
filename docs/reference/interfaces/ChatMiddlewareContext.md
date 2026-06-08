---
id: ChatMiddlewareContext
title: ChatMiddlewareContext
---

# Interface: ChatMiddlewareContext\<TContext\>

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:37](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L37)

Stable context object passed to all middleware hooks.
Created once per chat() invocation and shared across all hooks.

## Type Parameters

### TContext

`TContext` = `unknown`

## Properties

### abort()

```ts
abort: (reason?) => void;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:66](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L66)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:110](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L110)

Accumulated text content for the current iteration

***

### chunkIndex

```ts
chunkIndex: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:62](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L62)

Running count of chunks yielded so far

***

### context

```ts
context: TContext;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:68](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L68)

Runtime context provided by chat() options

***

### ~~conversationId?~~

```ts
optional conversationId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:56](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L56)

#### Deprecated

Use `threadId` instead. Retained as an alias of
`threadId` so middleware written before the AG-UI rename keeps
working unchanged. Will be removed in a future major release.

***

### createId()

```ts
createId: (prefix) => string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:117](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L117)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:108](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L108)

Current assistant message ID (changes per iteration)

***

### defer()

```ts
defer: (promise) => void;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:74](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L74)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:103](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L103)

Whether tools are configured

***

### iteration

```ts
iteration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:60](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L60)

Current agent loop iteration (0-indexed)

***

### messageCount

```ts
messageCount: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:101](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L101)

Number of messages at the start of the request

***

### messages

```ts
messages: readonly ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:115](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L115)

Current messages array (read-only view)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:81](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L81)

Model identifier (e.g., 'gpt-4o')

***

### modelOptions?

```ts
optional modelOptions: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:96](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L96)

Provider-specific model options

***

### options?

```ts
optional options: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:94](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L94)

Flattened generation options (metadata)

***

### phase

```ts
phase: ChatMiddlewarePhase;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:58](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L58)

Current lifecycle phase

***

### provider

```ts
provider: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:79](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L79)

Provider name (e.g., 'openai', 'anthropic')

***

### requestId

```ts
requestId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:39](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L39)

Unique identifier for this chat request

***

### runId

```ts
runId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:43](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L43)

AG-UI run identifier for correlating client and server events

***

### signal?

```ts
optional signal: AbortSignal;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:64](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L64)

Abort signal from the chat request

***

### source

```ts
source: "server" | "client";
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:83](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L83)

Source of the chat invocation — always 'server' for server-side chat

***

### streamId

```ts
streamId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:41](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L41)

Unique identifier for this stream

***

### streaming

```ts
streaming: boolean;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:85](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L85)

Whether the chat is streaming

***

### systemPrompts

```ts
systemPrompts: SystemPrompt[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:90](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L90)

System prompts configured for this chat

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:50](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L50)

AG-UI thread identifier — a stable per-conversation ID used to
correlate client and server devtools events. Resolves to the
caller-provided `threadId` (or legacy `conversationId`), or an
auto-generated value when neither is supplied.

***

### toolNames?

```ts
optional toolNames: string[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:92](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L92)

Names of configured tools, if any

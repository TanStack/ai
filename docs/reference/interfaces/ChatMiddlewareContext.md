---
id: ChatMiddlewareContext
title: ChatMiddlewareContext
---

# Interface: ChatMiddlewareContext

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:26](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L26)

Stable context object passed to all middleware hooks.
Created once per chat() invocation and shared across all hooks.

## Properties

### abort()

```ts
abort: (reason?) => void;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:53](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L53)

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

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:97](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L97)

Accumulated text content for the current iteration

***

### chunkIndex

```ts
chunkIndex: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:49](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L49)

Running count of chunks yielded so far

***

### context

```ts
context: unknown;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:55](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L55)

Opaque user-provided value from chat() options

***

### ~~conversationId?~~

```ts
optional conversationId: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:43](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L43)

#### Deprecated

Use `threadId` instead. Retained as an alias of
`threadId` so middleware written before the AG-UI rename keeps
working unchanged. Will be removed in a future major release.

***

### createId()

```ts
createId: (prefix) => string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:104](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L104)

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

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:95](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L95)

Current assistant message ID (changes per iteration)

***

### defer()

```ts
defer: (promise) => void;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:61](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L61)

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

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:90](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L90)

Whether tools are configured

***

### iteration

```ts
iteration: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:47](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L47)

Current agent loop iteration (0-indexed)

***

### messageCount

```ts
messageCount: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:88](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L88)

Number of messages at the start of the request

***

### messages

```ts
messages: readonly ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:102](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L102)

Current messages array (read-only view)

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:68](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L68)

Model identifier (e.g., 'gpt-4o')

***

### modelOptions?

```ts
optional modelOptions: Record<string, unknown>;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:83](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L83)

Provider-specific model options

***

### options?

```ts
optional options: Record<string, unknown>;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:81](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L81)

Flattened generation options (temperature, topP, maxTokens, metadata)

***

### phase

```ts
phase: ChatMiddlewarePhase;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:45](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L45)

Current lifecycle phase

***

### provider

```ts
provider: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:66](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L66)

Provider name (e.g., 'openai', 'anthropic')

***

### requestId

```ts
requestId: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:28](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L28)

Unique identifier for this chat request

***

### signal?

```ts
optional signal: AbortSignal;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:51](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L51)

Abort signal from the chat request

***

### source

```ts
source: "client" | "server";
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:70](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L70)

Source of the chat invocation — always 'server' for server-side chat

***

### streamId

```ts
streamId: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:30](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L30)

Unique identifier for this stream

***

### streaming

```ts
streaming: boolean;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:72](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L72)

Whether the chat is streaming

***

### systemPrompts

```ts
systemPrompts: string[];
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:77](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L77)

System prompts configured for this chat

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:37](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L37)

AG-UI thread identifier — a stable per-conversation ID used to
correlate client and server devtools events. Resolves to the
caller-provided `threadId` (or legacy `conversationId`), or an
auto-generated value when neither is supplied.

***

### toolNames?

```ts
optional toolNames: string[];
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:79](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L79)

Names of configured tools, if any

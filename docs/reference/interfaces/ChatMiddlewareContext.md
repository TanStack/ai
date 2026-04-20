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

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:42](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L42)

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

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:86](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L86)

Accumulated text content for the current iteration

***

### chunkIndex

```ts
chunkIndex: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:38](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L38)

Running count of chunks yielded so far

***

### context

```ts
context: unknown;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:44](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L44)

Opaque user-provided value from chat() options

***

### conversationId?

```ts
optional conversationId: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:32](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L32)

Conversation identifier, if provided by the caller

***

### createId()

```ts
createId: (prefix) => string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:93](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L93)

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

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:84](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L84)

Current assistant message ID (changes per iteration)

***

### defer()

```ts
defer: (promise) => void;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:50](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L50)

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

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:79](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L79)

Whether tools are configured

***

### iteration

```ts
iteration: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:36](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L36)

Current agent loop iteration (0-indexed)

***

### messageCount

```ts
messageCount: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:77](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L77)

Number of messages at the start of the request

***

### messages

```ts
messages: readonly ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:91](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L91)

Current messages array (read-only view)

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:57](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L57)

Model identifier (e.g., 'gpt-4o')

***

### modelOptions?

```ts
optional modelOptions: Record<string, unknown>;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:72](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L72)

Provider-specific model options

***

### options?

```ts
optional options: Record<string, unknown>;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:70](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L70)

Flattened generation options (temperature, topP, maxTokens, metadata)

***

### phase

```ts
phase: ChatMiddlewarePhase;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:34](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L34)

Current lifecycle phase

***

### provider

```ts
provider: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:55](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L55)

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

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:40](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L40)

Abort signal from the chat request

***

### source

```ts
source: "client" | "server";
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:59](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L59)

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

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:61](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L61)

Whether the chat is streaming

***

### systemPrompts

```ts
systemPrompts: string[];
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:66](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L66)

System prompts configured for this chat

***

### toolNames?

```ts
optional toolNames: string[];
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:68](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L68)

Names of configured tools, if any

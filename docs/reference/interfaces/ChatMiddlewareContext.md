---
id: ChatMiddlewareContext
title: ChatMiddlewareContext
---

# Interface: ChatMiddlewareContext\<TContext\>

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:184](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L184)

Stable context object passed to all middleware hooks.
Created once per chat() invocation and shared across all hooks.

## Type Parameters

### TContext

`TContext` = `unknown`

## Properties

### abort

```ts
abort: (reason?) => void;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:215](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L215)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:266](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L266)

Accumulated text content for the current iteration

***

### activity

```ts
activity: "chat";
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:233](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L233)

Which activity this context describes — always `'chat'`. Present so the
chat context structurally satisfies the base `GenerationMiddlewareContext`,
letting an observe-only middleware authored against the base (e.g.
`otelMiddleware`) run on both chat and media activities.

***

### capabilities

```ts
capabilities: CapabilityRegistry;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:280](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L280)

Capability bookkeeping for this request. Populated by middleware `setup`
hooks (via `provide` accessors) and read by later middleware (via `get`
accessors). Prefer the accessors returned by `createCapability` over using
this directly. Orthogonal to `context` (the user runtime context).

***

### chunkIndex

```ts
chunkIndex: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:211](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L211)

Running count of chunks yielded so far

***

### context

```ts
context: TContext;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:217](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L217)

Runtime context provided by chat() options

***

### ~~conversationId?~~

```ts
optional conversationId?: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:205](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L205)

#### Deprecated

Use `threadId` instead. Retained as an alias of
`threadId` so middleware written before the AG-UI rename keeps
working unchanged. Will be removed in a future major release.

***

### createId

```ts
createId: (prefix) => string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:273](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L273)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:264](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L264)

Current assistant message ID (changes per iteration)

***

### defer

```ts
defer: (promise) => void;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:223](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L223)

Defer a non-blocking side-effect promise.
Deferred promises do not block streaming and are awaited
after the terminal hook (onFinish/onAbort/onError).

#### Parameters

##### promise

`Promise`\<`unknown`\>

#### Returns

`void`

***

### get

```ts
get: <TValue>(capability) => TValue;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:285](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L285)

Read a provided capability by its handle. Equivalent to the handle's own
`get` accessor (`getX(ctx)`); throws if the capability was never provided.

#### Type Parameters

##### TValue

`TValue`

#### Parameters

##### capability

[`Capability`](../type-aliases/Capability.md)\<`TValue`\>

#### Returns

`TValue`

***

### getOptional

```ts
getOptional: <TValue>(capability) => TValue | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:290](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L290)

Read a capability by its handle, returning `undefined` if it was never
provided (never throws).

#### Type Parameters

##### TValue

`TValue`

#### Parameters

##### capability

[`Capability`](../type-aliases/Capability.md)\<`TValue`\>

#### Returns

`TValue` \| `undefined`

***

### hasTools

```ts
hasTools: boolean;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:259](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L259)

Whether tools are configured

***

### iteration

```ts
iteration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:209](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L209)

Current agent loop iteration (0-indexed)

***

### messageCount

```ts
messageCount: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:257](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L257)

Number of messages at the start of the request

***

### messages

```ts
messages: readonly ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:271](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L271)

Current messages array (read-only view)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:237](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L237)

Model identifier (e.g., 'gpt-5.5')

***

### modelOptions?

```ts
optional modelOptions?: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:252](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L252)

Provider-specific model options

***

### options?

```ts
optional options?: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:250](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L250)

Flattened generation options (metadata)

***

### parentRunId?

```ts
optional parentRunId?: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:192](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L192)

Interrupted or parent run correlated with this continuation.

***

### phase

```ts
phase: ChatMiddlewarePhase;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:207](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L207)

Current lifecycle phase

***

### provide

```ts
provide: <TValue>(capability, value) => void;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:295](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L295)

Provide a capability value. Equivalent to the handle's own `provide`
accessor (`provideX(ctx, value)`). Typically called from `setup`.

#### Type Parameters

##### TValue

`TValue`

#### Parameters

##### capability

[`Capability`](../type-aliases/Capability.md)\<`TValue`\>

##### value

`TValue`

#### Returns

`void`

***

### provider

```ts
provider: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:235](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L235)

Provider name (e.g., 'openai', 'anthropic')

***

### requestId

```ts
requestId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:186](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L186)

Unique identifier for this chat request

***

### runId

```ts
runId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:190](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L190)

AG-UI run identifier for correlating client and server events

***

### signal?

```ts
optional signal?: AbortSignal;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:213](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L213)

Abort signal from the chat request

***

### source

```ts
source: "server" | "client";
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:239](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L239)

Source of the chat invocation — always 'server' for server-side chat

***

### streamId

```ts
streamId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:188](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L188)

Unique identifier for this stream

***

### streaming

```ts
streaming: boolean;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:241](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L241)

Whether the chat is streaming

***

### systemPrompts

```ts
systemPrompts: SystemPrompt[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:246](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L246)

System prompts configured for this chat

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:199](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L199)

AG-UI thread identifier — a stable per-conversation ID used to
correlate client and server devtools events. Resolves to the
caller-provided `threadId` (or legacy `conversationId`), or an
auto-generated value when neither is supplied.

***

### toolNames?

```ts
optional toolNames?: string[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:248](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L248)

Names of configured tools, if any

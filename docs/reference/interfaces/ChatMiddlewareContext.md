---
id: ChatMiddlewareContext
title: ChatMiddlewareContext
---

# Interface: ChatMiddlewareContext\<TContext\>

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:89](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L89)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:120](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L120)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:171](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L171)

Accumulated text content for the current iteration

***

### activity

```ts
activity: "chat";
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:138](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L138)

Which activity this context describes — always `'chat'`. Present so the
chat context structurally satisfies the base `GenerationMiddlewareContext`,
letting an observe-only middleware authored against the base (e.g.
`otelMiddleware`) run on both chat and media activities.

***

### capabilities

```ts
capabilities: CapabilityRegistry;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:185](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L185)

Capability bookkeeping for this request. Populated by middleware `setup`
hooks (via `provide` accessors) and read by later middleware (via `get`
accessors). Prefer the accessors returned by `createCapability` over using
this directly. Orthogonal to `context` (the user runtime context).

***

### chunkIndex

```ts
chunkIndex: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:116](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L116)

Running count of chunks yielded so far

***

### context

```ts
context: TContext;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:122](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L122)

Runtime context provided by chat() options

***

### ~~conversationId?~~

```ts
optional conversationId?: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:110](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L110)

#### Deprecated

Use `threadId` instead. Retained as an alias of
`threadId` so middleware written before the AG-UI rename keeps
working unchanged. Will be removed in a future major release.

***

### createId

```ts
createId: (prefix) => string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:178](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L178)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:169](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L169)

Current assistant message ID (changes per iteration)

***

### defer

```ts
defer: (promise) => void;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:128](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L128)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:190](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L190)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:195](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L195)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:164](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L164)

Whether tools are configured

***

### iteration

```ts
iteration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:114](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L114)

Current agent loop iteration (0-indexed)

***

### messageCount

```ts
messageCount: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:162](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L162)

Number of messages at the start of the request

***

### messages

```ts
messages: readonly ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:176](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L176)

Current messages array (read-only view)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:142](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L142)

Model identifier (e.g., 'gpt-5.5')

***

### modelOptions?

```ts
optional modelOptions?: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:157](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L157)

Provider-specific model options

***

### options?

```ts
optional options?: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:155](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L155)

Flattened generation options (metadata)

***

### parentRunId?

```ts
optional parentRunId?: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:97](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L97)

Interrupted or parent run correlated with this continuation.

***

### phase

```ts
phase: ChatMiddlewarePhase;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:112](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L112)

Current lifecycle phase

***

### provide

```ts
provide: <TValue>(capability, value) => void;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:200](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L200)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:140](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L140)

Provider name (e.g., 'openai', 'anthropic')

***

### requestId

```ts
requestId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:91](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L91)

Unique identifier for this chat request

***

### runId

```ts
runId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:95](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L95)

AG-UI run identifier for correlating client and server events

***

### signal?

```ts
optional signal?: AbortSignal;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:118](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L118)

Abort signal from the chat request

***

### source

```ts
source: "server" | "client";
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:144](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L144)

Source of the chat invocation — always 'server' for server-side chat

***

### streamId

```ts
streamId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:93](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L93)

Unique identifier for this stream

***

### streaming

```ts
streaming: boolean;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:146](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L146)

Whether the chat is streaming

***

### systemPrompts

```ts
systemPrompts: SystemPrompt[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:151](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L151)

System prompts configured for this chat

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:104](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L104)

AG-UI thread identifier — a stable per-conversation ID used to
correlate client and server devtools events. Resolves to the
caller-provided `threadId` (or legacy `conversationId`), or an
auto-generated value when neither is supplied.

***

### toolNames?

```ts
optional toolNames?: string[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:153](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L153)

Names of configured tools, if any

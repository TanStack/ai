---
id: ChatMiddlewareContext
title: ChatMiddlewareContext
---

# Interface: ChatMiddlewareContext\<TContext\>

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:42](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L42)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:71](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L71)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:122](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L122)

Accumulated text content for the current iteration

***

### activity

```ts
activity: "chat";
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:89](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L89)

Which activity this context describes — always `'chat'`. Present so the
chat context structurally satisfies the base `GenerationMiddlewareContext`,
letting an observe-only middleware authored against the base (e.g.
`otelMiddleware`) run on both chat and media activities.

***

### capabilities

```ts
capabilities: CapabilityRegistry;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:136](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L136)

Capability bookkeeping for this request. Populated by middleware `setup`
hooks (via `provide` accessors) and read by later middleware (via `get`
accessors). Prefer the accessors returned by `createCapability` over using
this directly. Orthogonal to `context` (the user runtime context).

***

### chunkIndex

```ts
chunkIndex: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:67](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L67)

Running count of chunks yielded so far

***

### context

```ts
context: TContext;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:73](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L73)

Runtime context provided by chat() options

***

### ~~conversationId?~~

```ts
optional conversationId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:61](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L61)

#### Deprecated

Use `threadId` instead. Retained as an alias of
`threadId` so middleware written before the AG-UI rename keeps
working unchanged. Will be removed in a future major release.

***

### createId()

```ts
createId: (prefix) => string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:129](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L129)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:120](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L120)

Current assistant message ID (changes per iteration)

***

### defer()

```ts
defer: (promise) => void;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:79](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L79)

Defer a non-blocking side-effect promise.
Deferred promises do not block streaming and are awaited
after the terminal hook (onFinish/onAbort/onError).

#### Parameters

##### promise

`Promise`\<`unknown`\>

#### Returns

`void`

***

### get()

```ts
get: <TValue>(capability) => TValue;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:141](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L141)

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

### getOptional()

```ts
getOptional: <TValue>(capability) => TValue | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:146](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L146)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:115](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L115)

Whether tools are configured

***

### iteration

```ts
iteration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:65](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L65)

Current agent loop iteration (0-indexed)

***

### messageCount

```ts
messageCount: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:113](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L113)

Number of messages at the start of the request

***

### messages

```ts
messages: readonly ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:127](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L127)

Current messages array (read-only view)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:93](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L93)

Model identifier (e.g., 'gpt-4o')

***

### modelOptions?

```ts
optional modelOptions: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:108](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L108)

Provider-specific model options

***

### options?

```ts
optional options: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:106](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L106)

Flattened generation options (metadata)

***

### phase

```ts
phase: ChatMiddlewarePhase;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:63](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L63)

Current lifecycle phase

***

### provide()

```ts
provide: <TValue>(capability, value) => void;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:151](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L151)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:91](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L91)

Provider name (e.g., 'openai', 'anthropic')

***

### requestId

```ts
requestId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:44](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L44)

Unique identifier for this chat request

***

### runId

```ts
runId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:48](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L48)

AG-UI run identifier for correlating client and server events

***

### signal?

```ts
optional signal: AbortSignal;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:69](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L69)

Abort signal from the chat request

***

### source

```ts
source: "server" | "client";
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:95](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L95)

Source of the chat invocation — always 'server' for server-side chat

***

### streamId

```ts
streamId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:46](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L46)

Unique identifier for this stream

***

### streaming

```ts
streaming: boolean;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:97](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L97)

Whether the chat is streaming

***

### systemPrompts

```ts
systemPrompts: SystemPrompt[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:102](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L102)

System prompts configured for this chat

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:55](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L55)

AG-UI thread identifier — a stable per-conversation ID used to
correlate client and server devtools events. Resolves to the
caller-provided `threadId` (or legacy `conversationId`), or an
auto-generated value when neither is supplied.

***

### toolNames?

```ts
optional toolNames: string[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:104](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L104)

Names of configured tools, if any

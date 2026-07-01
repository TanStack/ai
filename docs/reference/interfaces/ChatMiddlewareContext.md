---
id: ChatMiddlewareContext
title: ChatMiddlewareContext
---

# Interface: ChatMiddlewareContext\<TContext\>

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:73](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L73)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:102](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L102)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:153](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L153)

Accumulated text content for the current iteration

***

### activity

```ts
activity: "chat";
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:120](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L120)

Which activity this context describes — always `'chat'`. Present so the
chat context structurally satisfies the base `GenerationMiddlewareContext`,
letting an observe-only middleware authored against the base (e.g.
`otelMiddleware`) run on both chat and media activities.

***

### capabilities

```ts
capabilities: CapabilityRegistry;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:167](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L167)

Capability bookkeeping for this request. Populated by middleware `setup`
hooks (via `provide` accessors) and read by later middleware (via `get`
accessors). Prefer the accessors returned by `createCapability` over using
this directly. Orthogonal to `context` (the user runtime context).

***

### chunkIndex

```ts
chunkIndex: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:98](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L98)

Running count of chunks yielded so far

***

### context

```ts
context: TContext;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:104](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L104)

Runtime context provided by chat() options

***

### ~~conversationId?~~

```ts
optional conversationId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:92](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L92)

#### Deprecated

Use `threadId` instead. Retained as an alias of
`threadId` so middleware written before the AG-UI rename keeps
working unchanged. Will be removed in a future major release.

***

### createId()

```ts
createId: (prefix) => string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:160](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L160)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:151](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L151)

Current assistant message ID (changes per iteration)

***

### defer()

```ts
defer: (promise) => void;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:110](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L110)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:172](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L172)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:177](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L177)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:146](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L146)

Whether tools are configured

***

### iteration

```ts
iteration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:96](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L96)

Current agent loop iteration (0-indexed)

***

### messageCount

```ts
messageCount: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:144](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L144)

Number of messages at the start of the request

***

### messages

```ts
messages: readonly ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:158](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L158)

Current messages array (read-only view)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:124](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L124)

Model identifier (e.g., 'gpt-4o')

***

### modelOptions?

```ts
optional modelOptions: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:139](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L139)

Provider-specific model options

***

### options?

```ts
optional options: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:137](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L137)

Flattened generation options (metadata)

***

### phase

```ts
phase: ChatMiddlewarePhase;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:94](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L94)

Current lifecycle phase

***

### provide()

```ts
provide: <TValue>(capability, value) => void;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:182](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L182)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:122](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L122)

Provider name (e.g., 'openai', 'anthropic')

***

### requestId

```ts
requestId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:75](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L75)

Unique identifier for this chat request

***

### runId

```ts
runId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:79](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L79)

AG-UI run identifier for correlating client and server events

***

### signal?

```ts
optional signal: AbortSignal;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:100](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L100)

Abort signal from the chat request

***

### source

```ts
source: "server" | "client";
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:126](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L126)

Source of the chat invocation — always 'server' for server-side chat

***

### streamId

```ts
streamId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:77](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L77)

Unique identifier for this stream

***

### streaming

```ts
streaming: boolean;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:128](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L128)

Whether the chat is streaming

***

### systemPrompts

```ts
systemPrompts: SystemPrompt[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:133](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L133)

System prompts configured for this chat

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:86](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L86)

AG-UI thread identifier — a stable per-conversation ID used to
correlate client and server devtools events. Resolves to the
caller-provided `threadId` (or legacy `conversationId`), or an
auto-generated value when neither is supplied.

***

### toolNames?

```ts
optional toolNames: string[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:135](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L135)

Names of configured tools, if any

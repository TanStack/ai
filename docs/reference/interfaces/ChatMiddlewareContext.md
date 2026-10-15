---
id: ChatMiddlewareContext
title: ChatMiddlewareContext
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:192](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L192)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:228](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L228)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:290](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L290)

Accumulated text content for the current iteration

***

### activities?

```ts
optional activities?: readonly ActivityRecord[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:301](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L301)

Frontend-only AG-UI activity sidecar. Never model input. Persistence
writes this when an ActivityStore is configured. Optional so code that
builds its own context keeps working; the engine always sets it.

***

### activity

```ts
activity: "chat";
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:257](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L257)

Which activity this context describes — always `'chat'`. Present so the
chat context structurally satisfies the base `GenerationMiddlewareContext`,
letting an observe-only middleware authored against the base (e.g.
`otelMiddleware`) run on both chat and media activities.

***

### capabilities

```ts
capabilities: CapabilityRegistry;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:310](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L310)

Capability bookkeeping for this request. Populated by middleware `setup`
hooks (via `provide` accessors) and read by later middleware (via `get`
accessors). Prefer the accessors returned by `createCapability` over using
this directly. Orthogonal to `context` (the user runtime context).

***

### chunkIndex

```ts
chunkIndex: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:224](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L224)

Running count of chunks yielded so far

***

### context

```ts
context: TContext;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:241](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L241)

Runtime context provided by chat() options

***

### ~~conversationId?~~

```ts
optional conversationId?: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:218](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L218)

#### Deprecated

Use `threadId` instead. Retained as an alias of
`threadId` so middleware written before the AG-UI rename keeps
working unchanged. Will be removed in a future major release.

***

### createId

```ts
createId: (prefix) => string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:303](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L303)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:288](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L288)

Current assistant message ID (changes per iteration)

***

### defer

```ts
defer: (promise) => void;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:247](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L247)

Defer a non-blocking side-effect promise.
Deferred promises do not block streaming and are awaited
after the terminal hook (onFinish/onAbort/onError).

#### Parameters

##### promise

`Promise`\<`unknown`\>

#### Returns

`void`

***

### emitCustomEvent

```ts
emitCustomEvent: (name, value, options?) => void;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:235](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L235)

Push a `CUSTOM` chunk onto the chat stream immediately.
The engine yields it as soon as it can (including while `onConfig`
is still awaiting work such as a summarize call). Durability then
flushes the event on its own, unless you pass `{ batch: true }`.

#### Parameters

##### name

`string`

##### value

`Record`\<`string`, `any`\>

##### options?

[`EmitCustomEventOptions`](EmitCustomEventOptions.md)

#### Returns

`void`

***

### get

```ts
get: <TValue>(capability) => TValue;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:315](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L315)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:320](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L320)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:283](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L283)

Whether tools are configured

***

### iteration

```ts
iteration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:222](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L222)

Current agent loop iteration (0-indexed)

***

### messageCount

```ts
messageCount: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:281](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L281)

Number of messages at the start of the request

***

### messages

```ts
messages: readonly ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:295](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L295)

Current messages array (read-only view)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:261](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L261)

Model identifier (e.g., 'gpt-5.5')

***

### modelOptions?

```ts
optional modelOptions?: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:276](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L276)

Provider-specific model options

***

### options?

```ts
optional options?: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:274](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L274)

Flattened generation options (metadata)

***

### parentRunId?

```ts
optional parentRunId?: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:200](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L200)

Interrupted or parent run correlated with this continuation.

***

### phase

```ts
phase: ChatMiddlewarePhase;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:220](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L220)

Current lifecycle phase

***

### provide

```ts
provide: <TValue>(capability, value) => void;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:325](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L325)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:259](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L259)

Provider name (e.g., 'openai', 'anthropic')

***

### requestId

```ts
requestId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:194](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L194)

Unique identifier for this chat request

***

### runId

```ts
runId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:198](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L198)

AG-UI run identifier for correlating client and server events

***

### signal?

```ts
optional signal?: AbortSignal;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:226](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L226)

Abort signal from the chat request

***

### source

```ts
source: "server" | "client";
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:263](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L263)

Source of the chat invocation — always 'server' for server-side chat

***

### streamId

```ts
streamId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:196](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L196)

Unique identifier for this stream

***

### streaming

```ts
streaming: boolean;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:265](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L265)

Whether the chat is streaming

***

### subagentRunId?

```ts
optional subagentRunId?: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:205](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L205)

Set when this run is a subagent. The id on the child's `SUBAGENT_STARTED`
and on every chunk it streams. Absent on a top-level run.

***

### systemPrompts

```ts
systemPrompts: SystemPrompt[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:270](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L270)

System prompts configured for this chat

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:212](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L212)

AG-UI thread identifier — a stable per-conversation ID used to
correlate client and server devtools events. Resolves to the
caller-provided `threadId` (or legacy `conversationId`), or an
auto-generated value when neither is supplied.

***

### toolNames?

```ts
optional toolNames?: string[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:272](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L272)

Names of configured tools, if any

---
id: ChatMiddlewareContext
title: ChatMiddlewareContext
---

Defined in: packages/ai/src/activities/chat/middleware/types.ts:193

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

Defined in: packages/ai/src/activities/chat/middleware/types.ts:227

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

Defined in: packages/ai/src/activities/chat/middleware/types.ts:294

Accumulated text content for the current iteration

***

### activities?

```ts
optional activities?: readonly ActivityRecord[];
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:305

Frontend-only AG-UI activity sidecar. Never model input. Persistence
writes this when an ActivityStore is configured. Optional so code that
builds its own context keeps working; the engine always sets it.

***

### activity

```ts
activity: "chat";
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:261

Which activity this context describes — always `'chat'`. Present so the
chat context structurally satisfies the base `GenerationMiddlewareContext`,
letting an observe-only middleware authored against the base (e.g.
`otelMiddleware`) run on both chat and media activities.

***

### capabilities

```ts
capabilities: CapabilityRegistry;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:314

Capability bookkeeping for this request. Populated by middleware `setup`
hooks (via `provide` accessors) and read by later middleware (via `get`
accessors). Prefer the accessors returned by `createCapability` over using
this directly. Orthogonal to `context` (the user runtime context).

***

### chunkIndex

```ts
chunkIndex: number;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:223

Running count of chunks yielded so far

***

### context

```ts
context: TContext;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:245

Runtime context provided by chat() options

***

### createId

```ts
createId: (prefix) => string;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:307

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

Defined in: packages/ai/src/activities/chat/middleware/types.ts:292

Current assistant message ID (changes per iteration)

***

### defer

```ts
defer: (promise) => void;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:251

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

Defined in: packages/ai/src/activities/chat/middleware/types.ts:239

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

Defined in: packages/ai/src/activities/chat/middleware/types.ts:319

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

Defined in: packages/ai/src/activities/chat/middleware/types.ts:324

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

Defined in: packages/ai/src/activities/chat/middleware/types.ts:287

Whether tools are configured

***

### iteration

```ts
iteration: number;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:221

Current agent loop iteration (0-indexed)

***

### messageCount

```ts
messageCount: number;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:285

Number of messages at the start of the request

***

### messages

```ts
messages: readonly ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:299

Current messages array (read-only view)

***

### model

```ts
model: string;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:265

Model identifier (e.g., 'gpt-5.5')

***

### modelOptions?

```ts
optional modelOptions?: Record<string, unknown>;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:280

Provider-specific model options

***

### options?

```ts
optional options?: Record<string, unknown>;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:278

Flattened generation options (metadata)

***

### parentRunId?

```ts
optional parentRunId?: string;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:201

Interrupted or parent run correlated with this continuation.

***

### parentSubagentRunId?

```ts
optional parentSubagentRunId?: string;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:210

The subagentRunId of the child that started this one, for a nested child.

***

### phase

```ts
phase: ChatMiddlewarePhase;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:219

Current lifecycle phase

***

### provide

```ts
provide: <TValue>(capability, value) => void;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:329

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

Defined in: packages/ai/src/activities/chat/middleware/types.ts:263

Provider name (e.g., 'openai', 'anthropic')

***

### requestId

```ts
requestId: string;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:195

Unique identifier for this chat request

***

### retry

```ts
retry: () => void;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:232

Call the model again. Works only in `onModelError`, and throws in any
other hook. `onConfig` runs again before the new call.

#### Returns

`void`

***

### runId

```ts
runId: string;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:199

AG-UI run identifier for correlating client and server events

***

### signal?

```ts
optional signal?: AbortSignal;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:225

Abort signal from the chat request

***

### source

```ts
source: "server" | "client";
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:267

Source of the chat invocation — always 'server' for server-side chat

***

### streamId

```ts
streamId: string;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:197

Unique identifier for this stream

***

### streaming

```ts
streaming: boolean;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:269

Whether the chat is streaming

***

### subagentName?

```ts
optional subagentName?: string;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:208

The agent name when this run is a subagent.

***

### subagentRunId?

```ts
optional subagentRunId?: string;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:206

Set when this run is a subagent. The id on the child's `SUBAGENT_STARTED`
and on every chunk it streams. Absent on a top-level run.

***

### systemPrompts

```ts
systemPrompts: SystemPrompt[];
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:274

System prompts configured for this chat

***

### threadId

```ts
threadId: string;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:217

AG-UI thread identifier — a stable per-conversation ID used to
correlate client and server devtools events. Resolves to the
caller-provided `threadId`, or an auto-generated value when none is
supplied.

***

### toolNames?

```ts
optional toolNames?: string[];
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:276

Names of configured tools, if any

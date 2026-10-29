---
id: ChatMiddlewareContext
title: ChatMiddlewareContext
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:194](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L194)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:240](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L240)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:307](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L307)

Accumulated text content for the current iteration

***

### activities?

```ts
optional activities?: readonly ActivityRecord[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:318](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L318)

Frontend-only AG-UI activity sidecar. Never model input. Persistence
writes this when an ActivityStore is configured. Optional so code that
builds its own context keeps working; the engine always sets it.

***

### activity

```ts
activity: "chat";
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:274](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L274)

Which activity this context describes — always `'chat'`. Present so the
chat context structurally satisfies the base `GenerationMiddlewareContext`,
letting an observe-only middleware authored against the base (e.g.
`otelMiddleware`) run on both chat and media activities.

***

### callMetadata

```ts
callMetadata: Readonly<TanStackMessageMetadata>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:236](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L236)

The `metadata.tanstack` of the current model call: source, stop reason,
response id, and so on. It changes as chunks arrive. Each assistant
message of the call gets a copy of it.

***

### capabilities

```ts
capabilities: CapabilityRegistry;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:327](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L327)

Capability bookkeeping for this request. Populated by middleware `setup`
hooks (via `provide` accessors) and read by later middleware (via `get`
accessors). Prefer the accessors returned by `createCapability` over using
this directly. Orthogonal to `context` (the user runtime context).

***

### childResumeIds?

```ts
optional childResumeIds?: ReadonlySet<string>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:218](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L218)

Interrupt ids in `resume` that a subagent tool call of this run answers.
This run does not answer them itself. They come from the subagent cards in
the messages the client sent. `undefined` when no child is resumed, and
for a router turn.

***

### chunkIndex

```ts
chunkIndex: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:230](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L230)

Running count of chunks yielded so far

***

### context

```ts
context: TContext;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:258](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L258)

Runtime context provided by chat() options

***

### createId

```ts
createId: (prefix) => string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:320](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L320)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:305](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L305)

Current assistant message ID (changes per iteration)

***

### defer

```ts
defer: (promise) => void;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:264](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L264)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:252](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L252)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:332](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L332)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:337](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L337)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:300](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L300)

Whether tools are configured

***

### iteration

```ts
iteration: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:228](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L228)

Current agent loop iteration (0-indexed)

***

### messageCount

```ts
messageCount: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:298](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L298)

Number of messages at the start of the request

***

### messages

```ts
messages: readonly ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:312](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L312)

Current messages array (read-only view)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:278](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L278)

Model identifier (e.g., 'gpt-5.5')

***

### modelOptions?

```ts
optional modelOptions?: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:293](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L293)

Provider-specific model options

***

### options?

```ts
optional options?: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:291](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L291)

Flattened generation options (metadata)

***

### parentRunId?

```ts
optional parentRunId?: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:202](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L202)

Interrupted or parent run correlated with this continuation.

***

### parentSubagentRunId?

```ts
optional parentSubagentRunId?: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:211](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L211)

The subagentRunId of the child that started this one, for a nested child.

***

### phase

```ts
phase: ChatMiddlewarePhase;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:226](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L226)

Current lifecycle phase

***

### provide

```ts
provide: <TValue>(capability, value) => void;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:342](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L342)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:276](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L276)

Provider name (e.g., 'openai', 'anthropic')

***

### requestId

```ts
requestId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:196](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L196)

Unique identifier for this chat request

***

### retry

```ts
retry: () => void;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:245](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L245)

Call the model again. Works only in `onModelError`, and throws in any
other hook. `onConfig` runs again before the new call.

#### Returns

`void`

***

### runId

```ts
runId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:200](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L200)

AG-UI run identifier for correlating client and server events

***

### signal?

```ts
optional signal?: AbortSignal;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:238](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L238)

Abort signal from the chat request

***

### source

```ts
source: "server" | "client";
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:280](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L280)

Source of the chat invocation — always 'server' for server-side chat

***

### streamId

```ts
streamId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:198](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L198)

Unique identifier for this stream

***

### streaming

```ts
streaming: boolean;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:282](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L282)

Whether the chat is streaming

***

### subagentName?

```ts
optional subagentName?: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:209](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L209)

The agent name when this run is a subagent.

***

### subagentRunId?

```ts
optional subagentRunId?: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:207](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L207)

Set when this run is a subagent. The id on the child's `SUBAGENT_STARTED`
and on every chunk it streams. Absent on a top-level run.

***

### systemPrompts

```ts
systemPrompts: SystemPrompt[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:287](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L287)

System prompts configured for this chat

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:224](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L224)

AG-UI thread identifier — a stable per-conversation ID used to
correlate client and server devtools events. It is the caller's
`threadId`.

***

### toolNames?

```ts
optional toolNames?: string[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:289](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L289)

Names of configured tools, if any

---
id: DefinedChatMiddleware
title: DefinedChatMiddleware
---

Defined in: [packages/ai/src/activities/chat/middleware/define.ts:11](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/define.ts#L11)

A middleware whose `requires`/`provides` tuple types are captured precisely
(via `const` inference) for the array coverage check and the builder.

## Extends

- [`ChatMiddleware`](ChatMiddleware.md)\<`TContext`, `TInterruptDefinitions`\>

## Type Parameters

### TContext

`TContext`

### TRequires

`TRequires` *extends* `ReadonlyArray`\<[`CapabilityHandle`](../type-aliases/CapabilityHandle.md)\>

### TProvides

`TProvides` *extends* `ReadonlyArray`\<[`CapabilityHandle`](../type-aliases/CapabilityHandle.md)\>

### TInterruptDefinitions

`TInterruptDefinitions` *extends* `AnyInterruptDefinition` = `never`

## Properties

### name?

```ts
optional name?: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:688](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L688)

Optional name for debugging and identification

#### Inherited from

[`ChatMiddleware`](ChatMiddleware.md).[`name`](ChatMiddleware.md#name)

***

### onAbort?

```ts
optional onAbort?: (ctx, info) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:907](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L907)

Called when the chat run is aborted.
Exactly one of onFinish/onAbort/onError will be called per run.

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

##### info

[`AbortInfo`](AbortInfo.md)

#### Returns

`void` \| `Promise`\<`void`\>

#### Inherited from

[`ChatMiddleware`](ChatMiddleware.md).[`onAbort`](ChatMiddleware.md#onabort)

***

### onAfterToolCall?

```ts
optional onAfterToolCall?: (ctx, info) => 
  | AfterToolCallDecision
| Promise<AfterToolCallDecision>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:871](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L871)

Called after a tool execution completes (success or failure).
Return `{ type: 'replaceResult', result }` to change the result that the
model and the stream see. Middleware run in order. Each one sees the
result of the one before it.

Also called for a tool call that did not run because the output limit
cut its answer. Then `ok` is false, and `error` is an `Error` with the
code `'max_tokens'`.

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

##### info

[`AfterToolCallInfo`](AfterToolCallInfo.md)

#### Returns

  \| [`AfterToolCallDecision`](../type-aliases/AfterToolCallDecision.md)
  \| `Promise`\<[`AfterToolCallDecision`](../type-aliases/AfterToolCallDecision.md)\>

#### Inherited from

[`ChatMiddleware`](ChatMiddleware.md).[`onAfterToolCall`](ChatMiddleware.md#onaftertoolcall)

***

### onBeforeToolCall?

```ts
optional onBeforeToolCall?: (ctx, hookCtx) => 
  | BeforeToolCallDecision
| Promise<BeforeToolCallDecision>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:856](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L856)

Called before a server tool runs and before a client tool is sent to the
client. Not called while the call waits for approval.
Can observe, transform args, skip execution, or abort the run.
The tool's `inputSchema` checks the args after this hook.

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

##### hookCtx

[`ToolCallHookContext`](ToolCallHookContext.md)

#### Returns

  \| [`BeforeToolCallDecision`](../type-aliases/BeforeToolCallDecision.md)
  \| `Promise`\<[`BeforeToolCallDecision`](../type-aliases/BeforeToolCallDecision.md)\>

#### Inherited from

[`ChatMiddleware`](ChatMiddleware.md).[`onBeforeToolCall`](ChatMiddleware.md#onbeforetoolcall)

***

### onChunk?

```ts
optional onChunk?: (ctx, chunk) => 
  | void
  | AGUIEvent
  | AGUIEvent[]
  | Promise<void | AGUIEvent | AGUIEvent[] | null>
  | null;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:840](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L840)

Called for every chunk yielded by chat().
Can observe, transform, expand, or drop chunks.

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

##### chunk

[`AGUIEvent`](../type-aliases/AGUIEvent.md)

#### Returns

  \| `void`
  \| [`AGUIEvent`](../type-aliases/AGUIEvent.md)
  \| [`AGUIEvent`](../type-aliases/AGUIEvent.md)[]
  \| `Promise`\<void \| AGUIEvent \| AGUIEvent\[\] \| null\>
  \| `null`

void (pass through), chunk (replace), chunk[] (expand), null (drop)

#### Inherited from

[`ChatMiddleware`](ChatMiddleware.md).[`onChunk`](ChatMiddleware.md#onchunk)

***

### onConfig?

```ts
optional onConfig?: (ctx, config) => 
  | void
  | Partial<ChatMiddlewareConfig>
  | Promise<
  | void
  | Partial<ChatMiddlewareConfig>
  | null>
  | null;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:752](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L752)

Called to observe or transform the chat configuration.
Called at init and at the beginning of each agent iteration.

Return a partial config to merge with the current config, or void to pass through.
Only the fields you return are overwritten — everything else is preserved.

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

##### config

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md)

#### Returns

  \| `void`
  \| `Partial`\<[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md)\>
  \| `Promise`\<
  \| `void`
  \| `Partial`\<[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md)\>
  \| `null`\>
  \| `null`

#### Inherited from

[`ChatMiddleware`](ChatMiddleware.md).[`onConfig`](ChatMiddleware.md#onconfig)

***

### onError?

```ts
optional onError?: (ctx, info) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:916](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L916)

Called when the chat run encounters an unhandled error.
Exactly one of onFinish/onAbort/onError will be called per run.

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

##### info

[`ErrorInfo`](ErrorInfo.md)

#### Returns

`void` \| `Promise`\<`void`\>

#### Inherited from

[`ChatMiddleware`](ChatMiddleware.md).[`onError`](ChatMiddleware.md#onerror)

***

### onFinish?

```ts
optional onFinish?: (ctx, info) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:898](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L898)

Called when the chat run completes normally.
Exactly one of onFinish/onAbort/onError will be called per run.

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

##### info

[`FinishInfo`](FinishInfo.md)

#### Returns

`void` \| `Promise`\<`void`\>

#### Inherited from

[`ChatMiddleware`](ChatMiddleware.md).[`onFinish`](ChatMiddleware.md#onfinish)

***

### onInterruptBoundary?

```ts
optional onInterruptBoundary?: (ctx) => 
  | InterruptBoundaryResult<TInterruptDefinitions>
| Promise<InterruptBoundaryResult<TInterruptDefinitions>>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:700](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L700)

Called at a lifecycle boundary. Return interrupt requests to pause the run.
Requests from every middleware in the same boundary form one batch.

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\> & `object`

#### Returns

  \| [`InterruptBoundaryResult`](../type-aliases/InterruptBoundaryResult.md)\<`TInterruptDefinitions`\>
  \| `Promise`\<[`InterruptBoundaryResult`](../type-aliases/InterruptBoundaryResult.md)\<`TInterruptDefinitions`\>\>

#### Inherited from

[`ChatMiddleware`](ChatMiddleware.md).[`onInterruptBoundary`](ChatMiddleware.md#oninterruptboundary)

***

### onInterruptResolution?

```ts
optional onInterruptResolution?: (ctx, resolutions) => 
  | InterruptResolutionResult
| Promise<InterruptResolutionResult>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:710](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L710)

Called on a continuation run after the client answers registered interrupts.
Return `toolResume` to decide whether pending tools continue, cancel, or stop.

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

##### resolutions

[`InterruptResolutionCollection`](InterruptResolutionCollection.md)\<`TInterruptDefinitions`\>

#### Returns

  \| [`InterruptResolutionResult`](../type-aliases/InterruptResolutionResult.md)
  \| `Promise`\<[`InterruptResolutionResult`](../type-aliases/InterruptResolutionResult.md)\>

#### Inherited from

[`ChatMiddleware`](ChatMiddleware.md).[`onInterruptResolution`](ChatMiddleware.md#oninterruptresolution)

***

### onIteration?

```ts
optional onIteration?: (ctx, info) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:794](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L794)

Called at the start of each agent loop iteration, after a new assistant message ID
is created. Use this to observe iteration boundaries.

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

##### info

[`IterationInfo`](IterationInfo.md)

#### Returns

`void` \| `Promise`\<`void`\>

#### Inherited from

[`ChatMiddleware`](ChatMiddleware.md).[`onIteration`](ChatMiddleware.md#oniteration)

***

### onModelError?

```ts
optional onModelError?: (ctx, error) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:829](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L829)

Called when the adapter sends a `RUN_ERROR` before any output of the
model call. The error does not reach `onChunk` or the caller yet. An
exception that the adapter throws goes to `onError`, not here.

Call `ctx.retry()` to call the model again. Then `onConfig` runs again
(phase `beforeModel`), so the middleware can change the request first,
and the failed call is dropped from the stream. Without `ctx.retry()`,
the error goes on as usual. A model call retries at most 2 times this
way. The structured-output call is not retried.

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

##### error

[`RunErrorEvent`](RunErrorEvent.md)

#### Returns

`void` \| `Promise`\<`void`\>

#### Inherited from

[`ChatMiddleware`](ChatMiddleware.md).[`onModelError`](ChatMiddleware.md#onmodelerror)

***

### onShouldContinue?

```ts
optional onShouldContinue?: (ctx, state) => boolean | void | Promise<boolean | void>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:813](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L813)

Called when the engine is deciding whether to start another agent-loop
iteration (after a tool phase or between model turns).

Return `false` to stop further iterations. Return `true`, `void`, or
`undefined` to allow continuation. Combined with AND semantics across
middleware and with `agentLoopStrategy` — any `false` stops the loop.

Does not abort the run: the stream finishes normally with the current
messages. Use `ctx.abort()` only when you need a hard abort.

Receives the same [AgentLoopState](AgentLoopState.md) passed to strategies
(`iterationCount`, `toolCallCount`, `lastTurnToolCallCount`, etc.).

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

##### state

[`AgentLoopState`](AgentLoopState.md)

#### Returns

`boolean` \| `void` \| `Promise`\<`boolean` \| `void`\>

#### Inherited from

[`ChatMiddleware`](ChatMiddleware.md).[`onShouldContinue`](ChatMiddleware.md#onshouldcontinue)

***

### onStart?

```ts
optional onStart?: (ctx) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:788](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L788)

Called when the chat run starts (after initial onConfig).

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

#### Returns

`void` \| `Promise`\<`void`\>

#### Inherited from

[`ChatMiddleware`](ChatMiddleware.md).[`onStart`](ChatMiddleware.md#onstart)

***

### onStructuredOutputConfig?

```ts
optional onStructuredOutputConfig?: (ctx, config) => 
  | void
  | Partial<StructuredOutputMiddlewareConfig>
  | Promise<
  | void
  | Partial<StructuredOutputMiddlewareConfig>
  | null>
  | null;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:776](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L776)

Called at the start of the final structured-output call (when the chat
was invoked with outputSchema). Pipes through middleware in order, like
onConfig, but with access to the JSON Schema being sent to the provider.

Return a partial to shallow-merge into the current config, or void to
pass through.

Fires BEFORE onConfig at the structured-output boundary. onConfig also
re-fires at the same boundary with ctx.phase === 'structuredOutput',
receiving the post-onStructuredOutputConfig view of the config (minus
outputSchema). Use onConfig for general-purpose transforms that apply
to every adapter call; use this hook when you need to transform the
outputSchema or apply structured-output-specific behavior.

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

##### config

[`StructuredOutputMiddlewareConfig`](StructuredOutputMiddlewareConfig.md)

#### Returns

  \| `void`
  \| `Partial`\<[`StructuredOutputMiddlewareConfig`](StructuredOutputMiddlewareConfig.md)\>
  \| `Promise`\<
  \| `void`
  \| `Partial`\<[`StructuredOutputMiddlewareConfig`](StructuredOutputMiddlewareConfig.md)\>
  \| `null`\>
  \| `null`

#### Inherited from

[`ChatMiddleware`](ChatMiddleware.md).[`onStructuredOutputConfig`](ChatMiddleware.md#onstructuredoutputconfig)

***

### onToolPhaseComplete?

```ts
optional onToolPhaseComplete?: (ctx, info) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:880](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L880)

Called after all tool calls in an iteration have been processed.
Provides aggregate data about tool execution results, approvals, and client tools.

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

##### info

[`ToolPhaseCompleteInfo`](ToolPhaseCompleteInfo.md)

#### Returns

`void` \| `Promise`\<`void`\>

#### Inherited from

[`ChatMiddleware`](ChatMiddleware.md).[`onToolPhaseComplete`](ChatMiddleware.md#ontoolphasecomplete)

***

### onUsage?

```ts
optional onUsage?: (ctx, usage) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:889](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L889)

Called when usage data is available from a RUN_FINISHED chunk.
Called once per model iteration that reports usage.

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

##### usage

[`UsageInfo`](UsageInfo.md)

#### Returns

`void` \| `Promise`\<`void`\>

#### Inherited from

[`ChatMiddleware`](ChatMiddleware.md).[`onUsage`](ChatMiddleware.md#onusage)

***

### optionalRequires?

```ts
optional optionalRequires?: readonly CapabilityHandle[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:735](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L735)

Capabilities this middleware uses if present but does not require.
Non-gating: never causes a validation error. Read with
`getX(ctx, { optional: true })`.

#### Inherited from

[`ChatMiddleware`](ChatMiddleware.md).[`optionalRequires`](ChatMiddleware.md#optionalrequires)

***

### provides?

```ts
optional provides?: TProvides;
```

Defined in: [packages/ai/src/activities/chat/middleware/define.ts:18](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/define.ts#L18)

Capabilities this middleware provides. Each declared capability MUST be
provided (via its `provide` accessor) inside `setup`, or `chat()` throws
after the setup phase.

#### Overrides

[`ChatMiddleware`](ChatMiddleware.md).[`provides`](ChatMiddleware.md#provides)

***

### requires?

```ts
optional requires?: TRequires;
```

Defined in: [packages/ai/src/activities/chat/middleware/define.ts:17](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/define.ts#L17)

Capabilities this middleware requires. `chat()` validates that some
middleware (or the adapter) provides each one; unsatisfied requirements are
a compile-time error (array coverage / builder) and a runtime error before
the adapter runs.

#### Overrides

[`ChatMiddleware`](ChatMiddleware.md).[`requires`](ChatMiddleware.md#requires)

***

### routedSubagentPersistence?

```ts
optional routedSubagentPersistence?: RoutedSubagentPersistence;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:694](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L694)

Present when this middleware stores subagent runs.
The router calls it. An app does not set it.

#### Inherited from

[`ChatMiddleware`](ChatMiddleware.md).[`routedSubagentPersistence`](ChatMiddleware.md#routedsubagentpersistence)

***

### sandbox?

```ts
optional sandbox?: ChatSandboxHooks<TContext>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:925](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L925)

Sandbox file-event hooks. Fire when a sandbox provided by `withSandbox` is
active during the run and a file is created/changed/deleted. Server-side.

#### Inherited from

[`ChatMiddleware`](ChatMiddleware.md).[`sandbox`](ChatMiddleware.md#sandbox)

***

### setup?

```ts
optional setup?: (ctx) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:743](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L743)

Provisioning hook. Runs FIRST — before `onConfig` (init) — across all
middleware in array order. Use it to call `provide` accessors so later
middleware (`onConfig` onward) can consume the capabilities. Receives the
stable context; does NOT receive the mutable config.

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

#### Returns

`void` \| `Promise`\<`void`\>

#### Inherited from

[`ChatMiddleware`](ChatMiddleware.md).[`setup`](ChatMiddleware.md#setup)

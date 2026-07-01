---
id: ChatMiddleware
title: ChatMiddleware
---

# Interface: ChatMiddleware\<TContext\>

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:408](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L408)

Chat middleware interface.

All hooks are optional. Middleware is composed in array order:
- `onConfig`: config piped through middlewares in order (first transform influences later)
- `onChunk`: each output chunk is fed into the next middleware in order

## Examples

```ts
const loggingMiddleware: ChatMiddleware = {
  name: 'logging',
  onStart(ctx) { console.log('Chat started', ctx.requestId) },
  onChunk(ctx, chunk) { console.log('Chunk:', chunk.type) },
  onFinish(ctx, info) { console.log('Done:', info.duration, 'ms') },
}
```

```ts
const redactionMiddleware: ChatMiddleware = {
  name: 'redaction',
  onChunk(ctx, chunk) {
    if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
      return { ...chunk, delta: redact(chunk.delta) }
    }
  },
}
```

## Extended by

- [`DefinedChatMiddleware`](DefinedChatMiddleware.md)

## Type Parameters

### TContext

`TContext` = `unknown`

## Properties

### name?

```ts
optional name: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:410](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L410)

Optional name for debugging and identification

***

### onAbort()?

```ts
optional onAbort: (ctx, info) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:560](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L560)

Called when the chat run is aborted.
Exactly one of onFinish/onAbort/onError will be called per run.

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

##### info

[`AbortInfo`](AbortInfo.md)

#### Returns

`void` \| `Promise`\<`void`\>

***

### onAfterToolCall()?

```ts
optional onAfterToolCall: (ctx, info) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:524](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L524)

Called after a tool execution completes (success or failure).

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

##### info

[`AfterToolCallInfo`](AfterToolCallInfo.md)

#### Returns

`void` \| `Promise`\<`void`\>

***

### onBeforeToolCall()?

```ts
optional onBeforeToolCall: (ctx, hookCtx) => 
  | BeforeToolCallDecision
| Promise<BeforeToolCallDecision>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:516](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L516)

Called before a tool is executed.
Can observe, transform args, skip execution, or abort the run.

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

##### hookCtx

[`ToolCallHookContext`](ToolCallHookContext.md)

#### Returns

  \| [`BeforeToolCallDecision`](../type-aliases/BeforeToolCallDecision.md)
  \| `Promise`\<[`BeforeToolCallDecision`](../type-aliases/BeforeToolCallDecision.md)\>

***

### onChunk()?

```ts
optional onChunk: (ctx, chunk) => 
  | void
  | AGUIEvent
  | AGUIEvent[]
  | Promise<void | AGUIEvent | AGUIEvent[] | null>
  | null;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:502](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L502)

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

***

### onConfig()?

```ts
optional onConfig: (ctx, config) => 
  | void
  | Partial<ChatMiddlewareConfig>
  | Promise<
  | void
  | Partial<ChatMiddlewareConfig>
  | null>
  | null;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:449](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L449)

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

***

### onError()?

```ts
optional onError: (ctx, info) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:569](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L569)

Called when the chat run encounters an unhandled error.
Exactly one of onFinish/onAbort/onError will be called per run.

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

##### info

[`ErrorInfo`](ErrorInfo.md)

#### Returns

`void` \| `Promise`\<`void`\>

***

### onFinish()?

```ts
optional onFinish: (ctx, info) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:551](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L551)

Called when the chat run completes normally.
Exactly one of onFinish/onAbort/onError will be called per run.

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

##### info

[`FinishInfo`](FinishInfo.md)

#### Returns

`void` \| `Promise`\<`void`\>

***

### onIteration()?

```ts
optional onIteration: (ctx, info) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:491](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L491)

Called at the start of each agent loop iteration, after a new assistant message ID
is created. Use this to observe iteration boundaries.

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

##### info

[`IterationInfo`](IterationInfo.md)

#### Returns

`void` \| `Promise`\<`void`\>

***

### onStart()?

```ts
optional onStart: (ctx) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:485](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L485)

Called when the chat run starts (after initial onConfig).

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

#### Returns

`void` \| `Promise`\<`void`\>

***

### onStructuredOutputConfig()?

```ts
optional onStructuredOutputConfig: (ctx, config) => 
  | void
  | Partial<StructuredOutputMiddlewareConfig>
  | Promise<
  | void
  | Partial<StructuredOutputMiddlewareConfig>
  | null>
  | null;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:473](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L473)

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

***

### onToolPhaseComplete()?

```ts
optional onToolPhaseComplete: (ctx, info) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:533](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L533)

Called after all tool calls in an iteration have been processed.
Provides aggregate data about tool execution results, approvals, and client tools.

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

##### info

[`ToolPhaseCompleteInfo`](ToolPhaseCompleteInfo.md)

#### Returns

`void` \| `Promise`\<`void`\>

***

### onUsage()?

```ts
optional onUsage: (ctx, usage) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:542](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L542)

Called when usage data is available from a RUN_FINISHED chunk.
Called once per model iteration that reports usage.

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

##### usage

[`UsageInfo`](UsageInfo.md)

#### Returns

`void` \| `Promise`\<`void`\>

***

### optionalRequires?

```ts
optional optionalRequires: readonly CapabilityHandle[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:432](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L432)

Capabilities this middleware uses if present but does not require.
Non-gating: never causes a validation error. Read with
`getX(ctx, { optional: true })`.

***

### provides?

```ts
optional provides: readonly CapabilityHandle[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:425](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L425)

Capabilities this middleware provides. Each declared capability MUST be
provided (via its `provide` accessor) inside `setup`, or `chat()` throws
after the setup phase.

***

### requires?

```ts
optional requires: readonly CapabilityHandle[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:418](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L418)

Capabilities this middleware requires. `chat()` validates that some
middleware (or the adapter) provides each one; unsatisfied requirements are
a compile-time error (array coverage / builder) and a runtime error before
the adapter runs.

***

### sandbox?

```ts
optional sandbox: ChatSandboxHooks<TContext>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:578](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L578)

Sandbox file-event hooks. Fire when a sandbox provided by `withSandbox` is
active during the run and a file is created/changed/deleted. Server-side.

***

### setup()?

```ts
optional setup: (ctx) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:440](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L440)

Provisioning hook. Runs FIRST — before `onConfig` (init) — across all
middleware in array order. Use it to call `provide` accessors so later
middleware (`onConfig` onward) can consume the capabilities. Receives the
stable context; does NOT receive the mutable config.

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

#### Returns

`void` \| `Promise`\<`void`\>

---
id: ChatMiddleware
title: ChatMiddleware
---

# Interface: ChatMiddleware

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:308](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L308)

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

## Properties

### name?

```ts
optional name: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:310](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L310)

Optional name for debugging and identification

***

### onAbort()?

```ts
optional onAbort: (ctx, info) => void | Promise<void>;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:406](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L406)

Called when the chat run is aborted.
Exactly one of onFinish/onAbort/onError will be called per run.

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)

##### info

[`AbortInfo`](AbortInfo.md)

#### Returns

`void` \| `Promise`\<`void`\>

***

### onAfterToolCall()?

```ts
optional onAfterToolCall: (ctx, info) => void | Promise<void>;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:370](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L370)

Called after a tool execution completes (success or failure).

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)

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

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:362](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L362)

Called before a tool is executed.
Can observe, transform args, skip execution, or abort the run.

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)

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

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:348](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L348)

Called for every chunk yielded by chat().
Can observe, transform, expand, or drop chunks.

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)

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
  | Promise<void | Partial<ChatMiddlewareConfig>>
  | null;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:319](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L319)

Called to observe or transform the chat configuration.
Called at init and at the beginning of each agent iteration.

Return a partial config to merge with the current config, or void to pass through.
Only the fields you return are overwritten — everything else is preserved.

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)

##### config

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md)

#### Returns

  \| `void`
  \| `Partial`\<[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md)\>
  \| `Promise`\<`void` \| `Partial`\<[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md)\>\>
  \| `null`

***

### onError()?

```ts
optional onError: (ctx, info) => void | Promise<void>;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:415](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L415)

Called when the chat run encounters an unhandled error.
Exactly one of onFinish/onAbort/onError will be called per run.

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)

##### info

[`ErrorInfo`](ErrorInfo.md)

#### Returns

`void` \| `Promise`\<`void`\>

***

### onFinish()?

```ts
optional onFinish: (ctx, info) => void | Promise<void>;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:397](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L397)

Called when the chat run completes normally.
Exactly one of onFinish/onAbort/onError will be called per run.

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)

##### info

[`FinishInfo`](FinishInfo.md)

#### Returns

`void` \| `Promise`\<`void`\>

***

### onIteration()?

```ts
optional onIteration: (ctx, info) => void | Promise<void>;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:337](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L337)

Called at the start of each agent loop iteration, after a new assistant message ID
is created. Use this to observe iteration boundaries.

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)

##### info

[`IterationInfo`](IterationInfo.md)

#### Returns

`void` \| `Promise`\<`void`\>

***

### onStart()?

```ts
optional onStart: (ctx) => void | Promise<void>;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:331](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L331)

Called when the chat run starts (after initial onConfig).

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)

#### Returns

`void` \| `Promise`\<`void`\>

***

### onToolPhaseComplete()?

```ts
optional onToolPhaseComplete: (ctx, info) => void | Promise<void>;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:379](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L379)

Called after all tool calls in an iteration have been processed.
Provides aggregate data about tool execution results, approvals, and client tools.

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)

##### info

[`ToolPhaseCompleteInfo`](ToolPhaseCompleteInfo.md)

#### Returns

`void` \| `Promise`\<`void`\>

***

### onUsage()?

```ts
optional onUsage: (ctx, usage) => void | Promise<void>;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:388](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L388)

Called when usage data is available from a RUN_FINISHED chunk.
Called once per model iteration that reports usage.

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)

##### usage

[`UsageInfo`](UsageInfo.md)

#### Returns

`void` \| `Promise`\<`void`\>

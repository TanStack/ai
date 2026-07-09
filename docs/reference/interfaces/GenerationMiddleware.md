---
id: GenerationMiddleware
title: GenerationMiddleware
---

# Interface: GenerationMiddleware\<TContext\>

Defined in: [packages/ai/src/activities/middleware/types.ts:145](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L145)

Activity-agnostic, observe-only middleware.

A thin lifecycle observer registerable on any activity via its `middleware`
option. Unlike `ChatMiddleware` (which can also rewrite config, chunks, and
tool calls), these hooks only observe — the right fit for the single
request → response shape of media activities. Pass `otelMiddleware()` for
OpenTelemetry, or implement the hooks directly for a custom backend.

Hooks are awaited in registration order. A hook that throws PROPAGATES and
fails the activity — matching `chat()` middleware semantics. Keep them cheap;
they run inline with the request.

Exactly one of `onFinish` / `onAbort` / `onError` fires per call.

## Example

```ts
import { generateImage } from '@tanstack/ai'
import { otelMiddleware } from '@tanstack/ai/middlewares/otel'
import { openaiImage } from '@tanstack/ai-openai'
import { trace } from '@opentelemetry/api'

await generateImage({
  adapter: openaiImage('gpt-image-1'),
  prompt: 'A serene mountain landscape at sunset',
  middleware: [otelMiddleware({ tracer: trace.getTracer('my-app') })],
})
```

## Type Parameters

### TContext

`TContext` = `unknown`

## Properties

### name?

```ts
optional name: string;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:147](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L147)

Optional name, surfaced in diagnostics.

***

### onAbort()?

```ts
optional onAbort: (ctx, info) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:161](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L161)

Called when the activity is aborted (e.g. an abandoned stream).

#### Parameters

##### ctx

[`GenerationMiddlewareContext`](GenerationMiddlewareContext.md)\<`TContext`\>

##### info

[`GenerationAbortInfo`](GenerationAbortInfo.md)

#### Returns

`void` \| `Promise`\<`void`\>

***

### onError()?

```ts
optional onError: (ctx, info) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:166](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L166)

Called when the activity throws before completing.

#### Parameters

##### ctx

[`GenerationMiddlewareContext`](GenerationMiddlewareContext.md)\<`TContext`\>

##### info

[`GenerationErrorInfo`](GenerationErrorInfo.md)

#### Returns

`void` \| `Promise`\<`void`\>

***

### onFinish()?

```ts
optional onFinish: (ctx, info) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:156](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L156)

Called after the activity completes successfully.

#### Parameters

##### ctx

[`GenerationMiddlewareContext`](GenerationMiddlewareContext.md)\<`TContext`\>

##### info

[`GenerationFinishInfo`](GenerationFinishInfo.md)

#### Returns

`void` \| `Promise`\<`void`\>

***

### onStart()?

```ts
optional onStart: (ctx) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:149](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L149)

Called before the adapter request begins.

#### Parameters

##### ctx

[`GenerationMiddlewareContext`](GenerationMiddlewareContext.md)\<`TContext`\>

#### Returns

`void` \| `Promise`\<`void`\>

***

### onUsage()?

```ts
optional onUsage: (ctx, usage) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:151](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L151)

Called when the provider reports usage, before `onFinish`.

#### Parameters

##### ctx

[`GenerationMiddlewareContext`](GenerationMiddlewareContext.md)\<`TContext`\>

##### usage

[`GenerationUsageInfo`](GenerationUsageInfo.md)

#### Returns

`void` \| `Promise`\<`void`\>

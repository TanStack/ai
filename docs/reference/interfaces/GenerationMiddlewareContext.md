---
id: GenerationMiddlewareContext
title: GenerationMiddlewareContext
---

Defined in: [packages/ai/src/activities/middleware/types.ts:59](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L59)

Stable context passed to every [GenerationMiddleware](GenerationMiddleware.md) hook. Created
once per activity call and shared across the hooks of that call.

Carries only fields every activity can honor. `ChatMiddlewareContext`
structurally includes all of these plus chat-only state (messages,
iteration, capabilities, …), which is why a chat middleware that reads those
extra fields is not assignable to `GenerationMiddleware`.

## Type Parameters

### TContext

`TContext` = `unknown`

## Properties

### activity

```ts
activity: GenerationActivity;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:66](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L66)

Which activity this call is. Discriminates media from chat.

***

### artifactInputs?

```ts
optional artifactInputs?: unknown;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:106](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L106)

Activity inputs captured for middleware that needs to transform or persist
the result together with reconstructable request metadata.

***

### context

```ts
context: TContext;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:86](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L86)

Runtime context provided by the activity options, if any.

***

### createId

```ts
createId: (prefix) => string;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:84](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L84)

Generate a unique id with the given prefix.

#### Parameters

##### prefix

`string`

#### Returns

`string`

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:70](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L70)

Model id. Emitted as `gen_ai.request.model`.

***

### modelOptions?

```ts
optional modelOptions?: unknown;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:80](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L80)

Provider-specific options passed to the activity, if any. Typed `unknown`
because each activity's options are strongly typed per model; a supertype
of `ChatMiddlewareContext`'s `modelOptions`.

***

### provider

```ts
provider: string;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:68](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L68)

Provider/adapter name (e.g. `"openai"`). Emitted as `gen_ai.system`.

***

### requestId

```ts
requestId: string;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:64](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L64)

Stable id correlating the `onStart` / `onFinish` / `onError` / `onAbort`
hooks of a single activity call.

***

### resultTransforms

```ts
resultTransforms: GenerationResultTransform<any, TContext>[];
```

Defined in: [packages/ai/src/activities/middleware/types.ts:101](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L101)

Result transforms registered by middleware during this activity call.
Transforms run after the raw adapter result exists and before the final
result is returned or streamed. Push multiple transforms to run them in
registration order.

REQUIRED (always an array, empty when nothing registered): middleware
registers by pushing onto it, so an optional array would let a host that
builds its own context omit it and silently no-op every registration —
generation persistence would then mark a run completed with neither its
result nor its artifacts written, with nothing to observe but the missing
data. Every context the library builds comes from
`createGenerationContext`, which always sets `[]`.

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:74](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L74)

Stable run id, when supplied by the caller.

***

### source

```ts
source: "server" | "client";
```

Defined in: [packages/ai/src/activities/middleware/types.ts:82](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L82)

Where the call originates. Always `'server'` for media activities.

***

### threadId?

```ts
optional threadId?: string;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:72](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L72)

Stable conversation/thread id, when supplied by the caller.

---
id: GenerationMiddlewareContext
title: GenerationMiddlewareContext
---

# Interface: GenerationMiddlewareContext\<TContext\>

Defined in: [packages/ai/src/activities/middleware/types.ts:81](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L81)

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

Defined in: [packages/ai/src/activities/middleware/types.ts:88](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L88)

Which activity this call is. Discriminates media from chat.

***

### artifactInputs?

```ts
optional artifactInputs: unknown;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:120](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L120)

Activity inputs captured for middleware that needs to transform or persist
the result together with reconstructable request metadata.

***

### context

```ts
context: TContext;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:108](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L108)

Runtime context provided by the activity options, if any.

***

### createId()

```ts
createId: (prefix) => string;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:106](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L106)

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

Defined in: [packages/ai/src/activities/middleware/types.ts:92](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L92)

Model id. Emitted as `gen_ai.request.model`.

***

### modelOptions?

```ts
optional modelOptions: unknown;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:102](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L102)

Provider-specific options passed to the activity, if any. Typed `unknown`
because each activity's options are strongly typed per model; a supertype
of `ChatMiddlewareContext`'s `modelOptions`.

***

### provider

```ts
provider: string;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:90](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L90)

Provider/adapter name (e.g. `"openai"`). Emitted as `gen_ai.system`.

***

### requestId

```ts
requestId: string;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:86](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L86)

Stable id correlating the `onStart` / `onFinish` / `onError` / `onAbort`
hooks of a single activity call.

***

### resultTransforms?

```ts
optional resultTransforms: GenerationResultTransform<any, TContext>[];
```

Defined in: [packages/ai/src/activities/middleware/types.ts:115](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L115)

Result transforms registered by middleware during this activity call.
Transforms run after the raw adapter result exists and before the final
result is returned or streamed. Push multiple transforms to run them in
registration order.

***

### runId?

```ts
optional runId: string;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:96](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L96)

Stable run id, when supplied by the caller.

***

### source

```ts
source: "server" | "client";
```

Defined in: [packages/ai/src/activities/middleware/types.ts:104](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L104)

Where the call originates. Always `'server'` for media activities.

***

### threadId?

```ts
optional threadId: string;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:94](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L94)

Stable conversation/thread id, when supplied by the caller.

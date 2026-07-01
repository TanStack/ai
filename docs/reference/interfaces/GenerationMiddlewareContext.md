---
id: GenerationMiddlewareContext
title: GenerationMiddlewareContext
---

# Interface: GenerationMiddlewareContext\<TContext\>

Defined in: [packages/ai/src/activities/middleware/types.ts:51](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L51)

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

Defined in: [packages/ai/src/activities/middleware/types.ts:58](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L58)

Which activity this call is. Discriminates media from chat.

***

### context

```ts
context: TContext;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:74](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L74)

Runtime context provided by the activity options, if any.

***

### createId()

```ts
createId: (prefix) => string;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:72](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L72)

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

Defined in: [packages/ai/src/activities/middleware/types.ts:62](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L62)

Model id. Emitted as `gen_ai.request.model`.

***

### modelOptions?

```ts
optional modelOptions: unknown;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:68](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L68)

Provider-specific options passed to the activity, if any. Typed `unknown`
because each activity's options are strongly typed per model; a supertype
of `ChatMiddlewareContext`'s `modelOptions`.

***

### provider

```ts
provider: string;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:60](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L60)

Provider/adapter name (e.g. `"openai"`). Emitted as `gen_ai.system`.

***

### requestId

```ts
requestId: string;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:56](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L56)

Stable id correlating the `onStart` / `onFinish` / `onError` / `onAbort`
hooks of a single activity call.

***

### source

```ts
source: "server" | "client";
```

Defined in: [packages/ai/src/activities/middleware/types.ts:70](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L70)

Where the call originates. Always `'server'` for media activities.

---
id: WorldGenerationOptions
title: WorldGenerationOptions
---

Defined in: [packages/ai/src/types.ts:2328](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2328)

**`Experimental`**

Options for world generation (live session or finished job).

 World generation is an experimental feature and may change.

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:2353](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2353)

**`Experimental`**

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2347](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2347)

**`Experimental`**

Internal logger threaded from the generateWorld() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2332](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2332)

**`Experimental`**

The model to use for world generation

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2341](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2341)

**`Experimental`**

Provider-specific options. Live adapters (Reactor) use mint fields here.
Job adapters (World Labs) use image/video inputs, `wait`, and poll.
Reactor resolution/seed/audio are browser `sendCommand` fields, not
token-mint fields.

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/ai/src/types.ts:2334](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2334)

**`Experimental`**

Natural-language description of the world or scene

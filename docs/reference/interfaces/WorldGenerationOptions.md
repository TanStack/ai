---
id: WorldGenerationOptions
title: WorldGenerationOptions
---

Defined in: [packages/ai/src/types.ts:2230](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2230)

**`Experimental`**

Options for world generation (live, prompt-steerable sessions).

 World generation is an experimental feature and may change.

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:2253](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2253)

**`Experimental`**

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2247](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2247)

**`Experimental`**

Internal logger threaded from the generateWorld() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2234](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2234)

**`Experimental`**

The model to use for world generation

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2241](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2241)

**`Experimental`**

Provider mint options. Reactor resolution/seed/audio are browser
`sendCommand` fields, not token-mint fields.

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/ai/src/types.ts:2236](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2236)

**`Experimental`**

Natural-language description of the world or scene

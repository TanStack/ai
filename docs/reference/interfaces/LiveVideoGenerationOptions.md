---
id: LiveVideoGenerationOptions
title: LiveVideoGenerationOptions
---

Defined in: [packages/ai/src/types.ts:2373](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2373)

**`Experimental`**

Options for live generation (prompt-steerable video sessions).

 Live generation is an experimental feature and may change.

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:2396](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2396)

**`Experimental`**

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2390](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2390)

**`Experimental`**

Internal logger threaded from the generateLiveVideo() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2377](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2377)

**`Experimental`**

The model to use for live generation

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2384](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2384)

**`Experimental`**

Provider mint options. For fal live this is `tokenDuration`. Reactor
resolution/seed/audio are browser `sendCommand` fields.

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/ai/src/types.ts:2379](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2379)

**`Experimental`**

Natural-language description of the shot or scene

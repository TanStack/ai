---
id: LiveVideoGenerationOptions
title: LiveVideoGenerationOptions
---

Defined in: [packages/ai/src/types.ts:2313](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2313)

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

Defined in: [packages/ai/src/types.ts:2336](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2336)

**`Experimental`**

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2330](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2330)

**`Experimental`**

Internal logger threaded from the generateLiveVideo() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2317](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2317)

**`Experimental`**

The model to use for live generation

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2324](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2324)

**`Experimental`**

Provider mint options. For fal live this is `tokenDuration`. Reactor
resolution/seed/audio are browser `sendCommand` fields.

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/ai/src/types.ts:2319](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2319)

**`Experimental`**

Natural-language description of the shot or scene

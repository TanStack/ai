---
id: LiveVideoGenerationOptions
title: LiveVideoGenerationOptions
---

Defined in: [packages/ai/src/types.ts:2807](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2807)

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

Defined in: [packages/ai/src/types.ts:2830](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2830)

**`Experimental`**

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2824](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2824)

**`Experimental`**

Internal logger threaded from the generateLiveVideo() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2811](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2811)

**`Experimental`**

The model to use for live generation

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2818](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2818)

**`Experimental`**

Provider mint options. For fal live this is `tokenDuration`. Reactor
resolution/seed/audio are browser `sendCommand` fields.

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/ai/src/types.ts:2813](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2813)

**`Experimental`**

Natural-language description of the shot or scene

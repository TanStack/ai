---
id: LiveVideoAdapter
title: LiveVideoAdapter
---

Defined in: packages/ai/src/activities/generateLiveVideo/adapter.ts:31

**`Experimental`**

Live adapter interface with pre-resolved generics.

An adapter is created by a provider function: `provider('model')` → `adapter`.
All type resolution happens at the provider call site, not in this interface.

Generic parameters:
- TModel: The specific model name (e.g. 'helios')
- TProviderOptions: Provider-specific options (already resolved)

 Live generation is an experimental feature and may change.

## Type Parameters

### TModel

`TModel` *extends* `string` = `string`

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

## Properties

### ~types

```ts
~types: object;
```

Defined in: packages/ai/src/activities/generateLiveVideo/adapter.ts:45

**`Internal`**

Type-only properties for inference. Not assigned at runtime.

#### providerOptions

```ts
providerOptions: TProviderOptions;
```

***

### createLiveVideo

```ts
createLiveVideo: (options) => Promise<LiveVideoGenerationResult>;
```

Defined in: packages/ai/src/activities/generateLiveVideo/adapter.ts:55

**`Experimental`**

Open a live video session from a prompt.

Server adapters typically mint a short-lived token and return it with the
prompt so a browser can connect, set the prompt, and start streaming.

#### Parameters

##### options

[`LiveVideoGenerationOptions`](LiveVideoGenerationOptions.md)\<`TProviderOptions`\>

#### Returns

`Promise`\<[`LiveVideoGenerationResult`](LiveVideoGenerationResult.md)\>

***

### kind

```ts
readonly kind: "liveVideo";
```

Defined in: packages/ai/src/activities/generateLiveVideo/adapter.ts:36

**`Experimental`**

Discriminator for adapter kind - used to determine API shape

***

### model

```ts
readonly model: TModel;
```

Defined in: packages/ai/src/activities/generateLiveVideo/adapter.ts:40

**`Experimental`**

The model this adapter is configured for

***

### name

```ts
readonly name: string;
```

Defined in: packages/ai/src/activities/generateLiveVideo/adapter.ts:38

**`Experimental`**

Adapter name identifier

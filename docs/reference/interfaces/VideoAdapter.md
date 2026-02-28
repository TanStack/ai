---
id: VideoAdapter
title: VideoAdapter
---

# Interface: VideoAdapter\<TModel, TProviderOptions, TModelProviderOptionsByName, TModelSizeByName\>

Defined in: [activities/generateVideo/adapter.ts:35](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateVideo/adapter.ts#L35)

**`Experimental`**

Video adapter interface with pre-resolved generics.

An adapter is created by a provider function: `provider('model')` → `adapter`
All type resolution happens at the provider call site, not in this interface.

 Video generation is an experimental feature and may change.

Generic parameters:
- TModel: The specific model name (e.g., 'sora-2')
- TProviderOptions: Provider-specific options (already resolved)
- TModelProviderOptionsByName: Map from model name to its specific provider options
- TModelSizeByName: Map from model name to its supported sizes

## Type Parameters

### TModel

`TModel` *extends* `string` = `string`

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

### TModelProviderOptionsByName

`TModelProviderOptionsByName` *extends* `Record`\<`string`, `any`\> = `Record`\<`string`, `any`\>

### TModelSizeByName

`TModelSizeByName` *extends* `Record`\<`string`, `string`\> = `Record`\<`string`, `string`\>

## Properties

### ~types

```ts
~types: object;
```

Defined in: [activities/generateVideo/adapter.ts:51](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateVideo/adapter.ts#L51)

**`Internal`**

Type-only properties for inference. Not assigned at runtime.

#### modelProviderOptionsByName

```ts
modelProviderOptionsByName: TModelProviderOptionsByName;
```

#### modelSizeByName

```ts
modelSizeByName: TModelSizeByName;
```

#### providerOptions

```ts
providerOptions: TProviderOptions;
```

***

### createVideoJob()

```ts
createVideoJob: (options) => Promise<VideoJobResult>;
```

Defined in: [activities/generateVideo/adapter.ts:61](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateVideo/adapter.ts#L61)

**`Experimental`**

Create a new video generation job.
Returns a job ID that can be used to poll for status and retrieve the video.

#### Parameters

##### options

[`VideoGenerationOptions`](VideoGenerationOptions.md)\<`TProviderOptions`, `TModelSizeByName`\[`TModel`\]\>

#### Returns

`Promise`\<[`VideoJobResult`](VideoJobResult.md)\>

***

### getVideoStatus()

```ts
getVideoStatus: (jobId) => Promise<VideoStatusResult>;
```

Defined in: [activities/generateVideo/adapter.ts:68](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateVideo/adapter.ts#L68)

**`Experimental`**

Get the current status of a video generation job.

#### Parameters

##### jobId

`string`

#### Returns

`Promise`\<[`VideoStatusResult`](VideoStatusResult.md)\>

***

### getVideoUrl()

```ts
getVideoUrl: (jobId) => Promise<VideoUrlResult>;
```

Defined in: [activities/generateVideo/adapter.ts:74](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateVideo/adapter.ts#L74)

**`Experimental`**

Get the URL to download/view the generated video.
Should only be called after status is 'completed'.

#### Parameters

##### jobId

`string`

#### Returns

`Promise`\<[`VideoUrlResult`](VideoUrlResult.md)\>

***

### kind

```ts
readonly kind: "video";
```

Defined in: [activities/generateVideo/adapter.ts:42](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateVideo/adapter.ts#L42)

**`Experimental`**

Discriminator for adapter kind - used to determine API shape

***

### model

```ts
readonly model: TModel;
```

Defined in: [activities/generateVideo/adapter.ts:46](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateVideo/adapter.ts#L46)

**`Experimental`**

The model this adapter is configured for

***

### name

```ts
readonly name: string;
```

Defined in: [activities/generateVideo/adapter.ts:44](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateVideo/adapter.ts#L44)

**`Experimental`**

Adapter name identifier

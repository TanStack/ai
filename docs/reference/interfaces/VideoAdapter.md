---
id: VideoAdapter
title: VideoAdapter
---

# Interface: VideoAdapter\<TModel, TProviderOptions, TModelProviderOptionsByName, TModelSizeByName, TModelInputModalitiesByName, TModelDurationByName\>

Defined in: [packages/ai/src/activities/generateVideo/adapter.ts:60](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateVideo/adapter.ts#L60)

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
- TModelInputModalitiesByName: Map from model name to the non-text prompt
  modalities it accepts (constrains the `prompt` part types at compile time)
- TModelDurationByName: Map from model name to its supported duration
  union. Defaults to `Record<string, number>` so adapters that haven't
  declared a map keep today's `duration?: number` typing.

## Type Parameters

### TModel

`TModel` *extends* `string` = `string`

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

### TModelProviderOptionsByName

`TModelProviderOptionsByName` *extends* `Record`\<`string`, `any`\> = `Record`\<`string`, `any`\>

### TModelSizeByName

`TModelSizeByName` *extends* `Record`\<`string`, `string` \| `undefined`\> = `Record`\<`string`, `string`\>

### TModelInputModalitiesByName

`TModelInputModalitiesByName` *extends* [`ModelInputModalitiesByName`](../type-aliases/ModelInputModalitiesByName.md) = [`ModelInputModalitiesByName`](../type-aliases/ModelInputModalitiesByName.md)

### TModelDurationByName

`TModelDurationByName` *extends* `Record`\<`string`, `string` \| `number` \| `undefined`\> = `Record`\<`string`, `number`\>

## Properties

### ~types

```ts
~types: object;
```

Defined in: [packages/ai/src/activities/generateVideo/adapter.ts:83](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateVideo/adapter.ts#L83)

**`Internal`**

Type-only properties for inference. Not assigned at runtime.

#### modelDurationByName

```ts
modelDurationByName: TModelDurationByName;
```

#### modelInputModalitiesByName

```ts
modelInputModalitiesByName: TModelInputModalitiesByName;
```

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

### availableDurations()

```ts
availableDurations: () => DurationOptions<TModelDurationByName[TModel]>;
```

Defined in: [packages/ai/src/activities/generateVideo/adapter.ts:119](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateVideo/adapter.ts#L119)

**`Experimental`**

Describe the durations this adapter's model accepts. Returns a tagged
union so consumers can render UI / coerce input without provider-specific
knowledge.

#### Returns

`DurationOptions`\<`TModelDurationByName`\[`TModel`\]\>

***

### createVideoJob()

```ts
createVideoJob: (options) => Promise<VideoJobResult>;
```

Defined in: [packages/ai/src/activities/generateVideo/adapter.ts:95](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateVideo/adapter.ts#L95)

**`Experimental`**

Create a new video generation job.
Returns a job ID that can be used to poll for status and retrieve the video.

#### Parameters

##### options

[`VideoGenerationOptions`](VideoGenerationOptions.md)\<`TProviderOptions`, `TModelSizeByName`\[`TModel`\], `TModelDurationByName`\[`TModel`\]\>

#### Returns

`Promise`\<[`VideoJobResult`](VideoJobResult.md)\>

***

### getVideoStatus()

```ts
getVideoStatus: (jobId) => Promise<VideoStatusResult>;
```

Defined in: [packages/ai/src/activities/generateVideo/adapter.ts:106](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateVideo/adapter.ts#L106)

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

Defined in: [packages/ai/src/activities/generateVideo/adapter.ts:112](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateVideo/adapter.ts#L112)

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

Defined in: [packages/ai/src/activities/generateVideo/adapter.ts:74](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateVideo/adapter.ts#L74)

**`Experimental`**

Discriminator for adapter kind - used to determine API shape

***

### model

```ts
readonly model: TModel;
```

Defined in: [packages/ai/src/activities/generateVideo/adapter.ts:78](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateVideo/adapter.ts#L78)

**`Experimental`**

The model this adapter is configured for

***

### name

```ts
readonly name: string;
```

Defined in: [packages/ai/src/activities/generateVideo/adapter.ts:76](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateVideo/adapter.ts#L76)

**`Experimental`**

Adapter name identifier

***

### snapDuration()

```ts
snapDuration: (seconds) => TModelDurationByName[TModel] | undefined;
```

Defined in: [packages/ai/src/activities/generateVideo/adapter.ts:125](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateVideo/adapter.ts#L125)

**`Experimental`**

Coerce a raw seconds value to the closest valid duration for this model.
Returns `undefined` for models with no duration field.

#### Parameters

##### seconds

`number`

#### Returns

`TModelDurationByName`\[`TModel`\] \| `undefined`

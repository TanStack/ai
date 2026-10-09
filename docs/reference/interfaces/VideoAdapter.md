---
id: VideoAdapter
title: VideoAdapter
---

Defined in: [packages/ai/src/activities/generateVideo/adapter.ts:69](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateVideo/adapter.ts#L69)

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

Defined in: [packages/ai/src/activities/generateVideo/adapter.ts:99](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateVideo/adapter.ts#L99)

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

### availableDurations

```ts
availableDurations: () => DurationOptions<TModelDurationByName[TModel]>;
```

Defined in: [packages/ai/src/activities/generateVideo/adapter.ts:145](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateVideo/adapter.ts#L145)

**`Experimental`**

Describe the durations this adapter's model accepts. Returns a tagged
union so consumers can render UI / coerce input without provider-specific
knowledge.

#### Returns

`DurationOptions`\<`TModelDurationByName`\[`TModel`\]\>

***

### createVideoJob

```ts
createVideoJob: (options) => Promise<VideoJobResult>;
```

Defined in: [packages/ai/src/activities/generateVideo/adapter.ts:111](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateVideo/adapter.ts#L111)

**`Experimental`**

Create a new video generation job.
Returns a job ID that can be used to poll for status and retrieve the video.

#### Parameters

##### options

[`VideoGenerationOptions`](VideoGenerationOptions.md)\<`TProviderOptions`, `TModelSizeByName`\[`TModel`\], `TModelDurationByName`\[`TModel`\]\>

#### Returns

`Promise`\<[`VideoJobResult`](VideoJobResult.md)\>

***

### getVideo?

```ts
optional getVideo?: (jobId) => Promise<
  | VideoUrlResult
| VideoStreamResult>;
```

Defined in: [packages/ai/src/activities/generateVideo/adapter.ts:132](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateVideo/adapter.ts#L132)

**`Experimental`**

Get the finished video: a public URL when the provider has one, or the
download stream for generation middleware to host. Call only after
status is 'completed'.

Optional only so adapters written against `getVideoUrl` keep working.
New adapters implement this.

#### Parameters

##### jobId

`string`

#### Returns

`Promise`\<
  \| [`VideoUrlResult`](VideoUrlResult.md)
  \| [`VideoStreamResult`](VideoStreamResult.md)\>

***

### getVideoStatus

```ts
getVideoStatus: (jobId) => Promise<VideoStatusResult>;
```

Defined in: [packages/ai/src/activities/generateVideo/adapter.ts:122](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateVideo/adapter.ts#L122)

**`Experimental`**

Get the current status of a video generation job.

#### Parameters

##### jobId

`string`

#### Returns

`Promise`\<[`VideoStatusResult`](VideoStatusResult.md)\>

***

### ~~getVideoUrl~~

```ts
getVideoUrl: (jobId) => Promise<VideoUrlResult>;
```

Defined in: [packages/ai/src/activities/generateVideo/adapter.ts:138](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateVideo/adapter.ts#L138)

**`Experimental`**

#### Parameters

##### jobId

`string`

#### Returns

`Promise`\<[`VideoUrlResult`](VideoUrlResult.md)\>

#### Deprecated

Use `getVideo`. This is `getVideo` with a provider stream
buffered into a base64 `data:` URL, which holds the whole video in memory.

***

### kind

```ts
readonly kind: "video";
```

Defined in: [packages/ai/src/activities/generateVideo/adapter.ts:83](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateVideo/adapter.ts#L83)

**`Experimental`**

Discriminator for adapter kind - used to determine API shape

***

### model

```ts
readonly model: TModel;
```

Defined in: [packages/ai/src/activities/generateVideo/adapter.ts:94](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateVideo/adapter.ts#L94)

**`Experimental`**

The model this adapter is configured for

***

### name

```ts
readonly name: string;
```

Defined in: [packages/ai/src/activities/generateVideo/adapter.ts:85](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateVideo/adapter.ts#L85)

**`Experimental`**

Adapter name identifier

***

### snapDuration

```ts
snapDuration: (input) => TModelDurationByName[TModel] | undefined;
```

Defined in: [packages/ai/src/activities/generateVideo/adapter.ts:154](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateVideo/adapter.ts#L154)

**`Experimental`**

Coerce `input` to the closest duration this model accepts.
`input` may be seconds (`7`), a numeric string (`"7"`), a template
(`"6s"`), or a keyword the model lists (`"auto"`).
Returns `undefined` when the model has no duration field, or when
`input` is a keyword that model does not list.

#### Parameters

##### input

`string` \| `number`

#### Returns

`TModelDurationByName`\[`TModel`\] \| `undefined`

***

### supportsFileSources?

```ts
readonly optional supportsFileSources?: boolean;
```

Defined in: [packages/ai/src/activities/generateVideo/adapter.ts:92](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateVideo/adapter.ts#L92)

**`Experimental`**

Declares that this adapter can consume `{ type: 'file' }` content
sources (provider Files API references). The activity dispatcher rejects
file sources in preflight for adapters that don't declare this, so
adapters written before the file arm existed fail closed.

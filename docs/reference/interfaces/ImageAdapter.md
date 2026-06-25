---
id: ImageAdapter
title: ImageAdapter
---

# Interface: ImageAdapter\<TModel, TProviderOptions, TModelProviderOptionsByName, TModelSizeByName, TModelInputModalitiesByName\>

Defined in: [packages/ai/src/activities/generateImage/adapter.ts:39](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateImage/adapter.ts#L39)

Image adapter interface with pre-resolved generics.

An adapter is created by a provider function: `provider('model')` → `adapter`
All type resolution happens at the provider call site, not in this interface.

Generic parameters:
- TModel: The specific model name (e.g., 'dall-e-3')
- TProviderOptions: Base provider-specific options (already resolved)
- TModelProviderOptionsByName: Map from model name to its specific provider options
- TModelSizeByName: Map from model name to its supported sizes
- TModelInputModalitiesByName: Map from model name to the non-text prompt
  modalities it accepts (constrains the `prompt` part types at compile time)

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

## Properties

### ~types

```ts
~types: object;
```

Defined in: [packages/ai/src/activities/generateImage/adapter.ts:60](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateImage/adapter.ts#L60)

**`Internal`**

Type-only properties for inference. Not assigned at runtime.

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

### generateImages()

```ts
generateImages: (options) => Promise<ImageGenerationResult>;
```

Defined in: [packages/ai/src/activities/generateImage/adapter.ts:70](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateImage/adapter.ts#L70)

Generate images from a prompt

#### Parameters

##### options

[`ImageGenerationOptions`](ImageGenerationOptions.md)\<`TProviderOptions`, `TModelSizeByName`\[`TModel`\]\>

#### Returns

`Promise`\<[`ImageGenerationResult`](ImageGenerationResult.md)\>

***

### kind

```ts
readonly kind: "image";
```

Defined in: [packages/ai/src/activities/generateImage/adapter.ts:51](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateImage/adapter.ts#L51)

Discriminator for adapter kind - used by generate() to determine API shape

***

### model

```ts
readonly model: TModel;
```

Defined in: [packages/ai/src/activities/generateImage/adapter.ts:55](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateImage/adapter.ts#L55)

The model this adapter is configured for

***

### name

```ts
readonly name: string;
```

Defined in: [packages/ai/src/activities/generateImage/adapter.ts:53](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateImage/adapter.ts#L53)

Adapter name identifier

---
id: ImageAdapter
title: ImageAdapter
---

# Interface: ImageAdapter\<TModel, TProviderOptions, TModelProviderOptionsByName, TModelSizeByName\>

Defined in: [activities/generateImage/adapter.ts:26](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateImage/adapter.ts#L26)

Image adapter interface with pre-resolved generics.

An adapter is created by a provider function: `provider('model')` → `adapter`
All type resolution happens at the provider call site, not in this interface.

Generic parameters:
- TModel: The specific model name (e.g., 'dall-e-3')
- TProviderOptions: Base provider-specific options (already resolved)
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

Defined in: [activities/generateImage/adapter.ts:42](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateImage/adapter.ts#L42)

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

### generateImages()

```ts
generateImages: (options) => Promise<ImageGenerationResult>;
```

Defined in: [activities/generateImage/adapter.ts:51](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateImage/adapter.ts#L51)

Generate images from a prompt

#### Parameters

##### options

[`ImageGenerationOptions`](ImageGenerationOptions.md)\<`TProviderOptions`\>

#### Returns

`Promise`\<[`ImageGenerationResult`](ImageGenerationResult.md)\>

***

### kind

```ts
readonly kind: "image";
```

Defined in: [activities/generateImage/adapter.ts:33](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateImage/adapter.ts#L33)

Discriminator for adapter kind - used by generate() to determine API shape

***

### model

```ts
readonly model: TModel;
```

Defined in: [activities/generateImage/adapter.ts:37](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateImage/adapter.ts#L37)

The model this adapter is configured for

***

### name

```ts
readonly name: string;
```

Defined in: [activities/generateImage/adapter.ts:35](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateImage/adapter.ts#L35)

Adapter name identifier

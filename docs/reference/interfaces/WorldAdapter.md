---
id: WorldAdapter
title: WorldAdapter
---

Defined in: [packages/ai/src/activities/generateWorld/adapter.ts:28](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateWorld/adapter.ts#L28)

**`Experimental`**

World adapter interface with pre-resolved generics.

An adapter is created by a provider function: `provider('model')` → `adapter`.
All type resolution happens at the provider call site, not in this interface.

Generic parameters:
- TModel: The specific model name (e.g. 'visko-orbis-stable')
- TProviderOptions: Provider-specific options (already resolved)

 World generation is an experimental feature and may change.

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

Defined in: [packages/ai/src/activities/generateWorld/adapter.ts:42](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateWorld/adapter.ts#L42)

**`Internal`**

Type-only properties for inference. Not assigned at runtime.

#### providerOptions

```ts
providerOptions: TProviderOptions;
```

***

### createWorld

```ts
createWorld: (options) => Promise<WorldGenerationResult>;
```

Defined in: [packages/ai/src/activities/generateWorld/adapter.ts:52](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateWorld/adapter.ts#L52)

**`Experimental`**

Open a world session from a prompt.

Server adapters typically mint a short-lived token and return it with the
prompt so a browser can connect, set the prompt, and start streaming.

#### Parameters

##### options

[`WorldGenerationOptions`](WorldGenerationOptions.md)\<`TProviderOptions`\>

#### Returns

`Promise`\<[`WorldGenerationResult`](WorldGenerationResult.md)\>

***

### kind

```ts
readonly kind: "world";
```

Defined in: [packages/ai/src/activities/generateWorld/adapter.ts:33](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateWorld/adapter.ts#L33)

**`Experimental`**

Discriminator for adapter kind - used to determine API shape

***

### model

```ts
readonly model: TModel;
```

Defined in: [packages/ai/src/activities/generateWorld/adapter.ts:37](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateWorld/adapter.ts#L37)

**`Experimental`**

The model this adapter is configured for

***

### name

```ts
readonly name: string;
```

Defined in: [packages/ai/src/activities/generateWorld/adapter.ts:35](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateWorld/adapter.ts#L35)

**`Experimental`**

Adapter name identifier

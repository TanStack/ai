---
id: EvaluateAdapter
title: EvaluateAdapter
---

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:226](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L226)

Evaluate adapter interface with pre-resolved generics.

An adapter is created by a provider function: `provider('model')` → `adapter`.
All type resolution happens at the provider call site, not in this interface.

Generic parameters:
- TModel: The specific model name (e.g. `'jev-latest'`)
- TProviderOptions: Provider-specific options (already resolved)

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

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:240](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L240)

**`Internal`**

Type-only properties for inference. Not assigned at runtime.

#### providerOptions

```ts
providerOptions: TProviderOptions;
```

***

### evaluate

```ts
evaluate: (options) => Promise<EvaluateAdapterResult>;
```

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:248](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L248)

Evaluate typed questions against `state`. Return the provider payload.
Do not invent unified `.value` fields. The activity maps wire answers.

#### Parameters

##### options

`EvaluateOptions`\<`TProviderOptions`\>

#### Returns

`Promise`\<`EvaluateAdapterResult`\>

***

### kind

```ts
readonly kind: "evaluate";
```

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:231](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L231)

Discriminator for adapter kind

***

### model

```ts
readonly model: TModel;
```

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:235](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L235)

The model this adapter is configured for

***

### name

```ts
readonly name: string;
```

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:233](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L233)

Adapter name identifier

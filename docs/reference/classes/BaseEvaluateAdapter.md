---
id: BaseEvaluateAdapter
title: BaseEvaluateAdapter
---

Defined in: packages/ai/src/activities/evaluate/adapter.ts:189

Abstract base class for evaluate adapters.
Extend this class to implement an evaluate adapter for a specific provider.

Generic parameters match EvaluateAdapter. The provider function resolves them.

## Type Parameters

### TModel

`TModel` *extends* `string` = `string`

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

## Implements

- [`EvaluateAdapter`](../interfaces/EvaluateAdapter.md)\<`TModel`, `TProviderOptions`\>

## Constructors

### Constructor

```ts
new BaseEvaluateAdapter<TModel, TProviderOptions>(config?, model): BaseEvaluateAdapter<TModel, TProviderOptions>;
```

Defined in: packages/ai/src/activities/evaluate/adapter.ts:204

#### Parameters

##### config?

`EvaluateAdapterConfig` = `{}`

##### model

`TModel`

#### Returns

`BaseEvaluateAdapter`\<`TModel`, `TProviderOptions`\>

## Properties

### ~types

```ts
~types: object;
```

Defined in: packages/ai/src/activities/evaluate/adapter.ts:198

**`Internal`**

Type-only properties for inference. Not assigned at runtime.

#### providerOptions

```ts
providerOptions: TProviderOptions;
```

#### Implementation of

[`EvaluateAdapter`](../interfaces/EvaluateAdapter.md).[`~types`](../interfaces/EvaluateAdapter.md#types)

***

### config

```ts
protected config: EvaluateAdapterConfig;
```

Defined in: packages/ai/src/activities/evaluate/adapter.ts:202

***

### kind

```ts
readonly kind: "evaluate";
```

Defined in: packages/ai/src/activities/evaluate/adapter.ts:193

Discriminator for adapter kind

#### Implementation of

[`EvaluateAdapter`](../interfaces/EvaluateAdapter.md).[`kind`](../interfaces/EvaluateAdapter.md#kind)

***

### model

```ts
readonly model: TModel;
```

Defined in: packages/ai/src/activities/evaluate/adapter.ts:195

The model this adapter is configured for

#### Implementation of

[`EvaluateAdapter`](../interfaces/EvaluateAdapter.md).[`model`](../interfaces/EvaluateAdapter.md#model)

***

### name

```ts
abstract readonly name: string;
```

Defined in: packages/ai/src/activities/evaluate/adapter.ts:194

Adapter name identifier

#### Implementation of

[`EvaluateAdapter`](../interfaces/EvaluateAdapter.md).[`name`](../interfaces/EvaluateAdapter.md#name)

## Methods

### evaluate()

```ts
abstract evaluate(options): Promise<EvaluateAdapterResult>;
```

Defined in: packages/ai/src/activities/evaluate/adapter.ts:209

Evaluate typed questions against `state`. Return the provider payload.
Do not invent unified `.value` fields. The activity maps wire answers.

#### Parameters

##### options

`EvaluateOptions`\<`TProviderOptions`\>

#### Returns

`Promise`\<`EvaluateAdapterResult`\>

#### Implementation of

[`EvaluateAdapter`](../interfaces/EvaluateAdapter.md).[`evaluate`](../interfaces/EvaluateAdapter.md#evaluate)

***

### generateId()

```ts
protected generateId(): string;
```

Defined in: packages/ai/src/activities/evaluate/adapter.ts:213

#### Returns

`string`

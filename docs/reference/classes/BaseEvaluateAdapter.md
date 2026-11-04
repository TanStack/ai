---
id: BaseEvaluateAdapter
title: BaseEvaluateAdapter
---

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:265](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L265)

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

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:280](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L280)

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

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:274](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L274)

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

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:278](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L278)

***

### kind

```ts
readonly kind: "evaluate";
```

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:269](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L269)

Discriminator for adapter kind

#### Implementation of

[`EvaluateAdapter`](../interfaces/EvaluateAdapter.md).[`kind`](../interfaces/EvaluateAdapter.md#kind)

***

### model

```ts
readonly model: TModel;
```

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:271](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L271)

The model this adapter is configured for

#### Implementation of

[`EvaluateAdapter`](../interfaces/EvaluateAdapter.md).[`model`](../interfaces/EvaluateAdapter.md#model)

***

### name

```ts
abstract readonly name: string;
```

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:270](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L270)

Adapter name identifier

#### Implementation of

[`EvaluateAdapter`](../interfaces/EvaluateAdapter.md).[`name`](../interfaces/EvaluateAdapter.md#name)

## Methods

### evaluate()

```ts
abstract evaluate(options): Promise<EvaluateAdapterResult>;
```

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:285](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L285)

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

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:289](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L289)

#### Returns

`string`

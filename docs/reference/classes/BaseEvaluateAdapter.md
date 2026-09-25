---
id: BaseEvaluateAdapter
title: BaseEvaluateAdapter
---

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:185](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L185)

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

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:200](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L200)

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

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:194](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L194)

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

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:198](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L198)

***

### kind

```ts
readonly kind: "evaluate";
```

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:189](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L189)

Discriminator for adapter kind

#### Implementation of

[`EvaluateAdapter`](../interfaces/EvaluateAdapter.md).[`kind`](../interfaces/EvaluateAdapter.md#kind)

***

### model

```ts
readonly model: TModel;
```

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:191](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L191)

The model this adapter is configured for

#### Implementation of

[`EvaluateAdapter`](../interfaces/EvaluateAdapter.md).[`model`](../interfaces/EvaluateAdapter.md#model)

***

### name

```ts
abstract readonly name: string;
```

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:190](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L190)

Adapter name identifier

#### Implementation of

[`EvaluateAdapter`](../interfaces/EvaluateAdapter.md).[`name`](../interfaces/EvaluateAdapter.md#name)

## Methods

### evaluate()

```ts
abstract evaluate(options): Promise<EvaluateAdapterResult>;
```

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:205](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L205)

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

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:209](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L209)

#### Returns

`string`

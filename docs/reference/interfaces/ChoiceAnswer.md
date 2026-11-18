---
id: ChoiceAnswer
title: ChoiceAnswer
---

Defined in: [packages/ai/src/activities/evaluate/index.ts:70](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L70)

Public choice answer. `.value` is the selected option key.

## Type Parameters

### TValue

`TValue` *extends* `string` = `string`

## Properties

### confidence

```ts
confidence: number;
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:75](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L75)

***

### probabilities

```ts
probabilities: Record<TValue, number>;
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:76](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L76)

***

### probability

```ts
probability: number;
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:74](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L74)

P(selected option).

***

### type

```ts
type: "choice";
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:71](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L71)

***

### value

```ts
value: TValue;
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:72](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L72)

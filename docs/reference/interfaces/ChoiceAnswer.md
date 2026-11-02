---
id: ChoiceAnswer
title: ChoiceAnswer
---

Defined in: [packages/ai/src/activities/evaluate/index.ts:65](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L65)

Public choice answer. `.value` is the selected option key.

## Type Parameters

### TValue

`TValue` *extends* `string` = `string`

## Properties

### confidence

```ts
confidence: number;
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:70](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L70)

***

### probabilities

```ts
probabilities: Record<TValue, number>;
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:71](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L71)

***

### probability

```ts
probability: number;
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:69](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L69)

P(selected option).

***

### type

```ts
type: "choice";
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:66](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L66)

***

### value

```ts
value: TValue;
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:67](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L67)

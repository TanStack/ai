---
id: ChoiceAnswer
title: ChoiceAnswer
---

Defined in: packages/ai/src/activities/evaluate/index.ts:64

Public choice answer. `.value` is the selected option key.

## Type Parameters

### TValue

`TValue` *extends* `string` = `string`

## Properties

### confidence

```ts
confidence: number;
```

Defined in: packages/ai/src/activities/evaluate/index.ts:69

***

### probabilities

```ts
probabilities: Record<TValue, number>;
```

Defined in: packages/ai/src/activities/evaluate/index.ts:70

***

### probability

```ts
probability: number;
```

Defined in: packages/ai/src/activities/evaluate/index.ts:68

P(selected option).

***

### type

```ts
type: "choice";
```

Defined in: packages/ai/src/activities/evaluate/index.ts:65

***

### value

```ts
value: TValue;
```

Defined in: packages/ai/src/activities/evaluate/index.ts:66

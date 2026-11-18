---
id: ScoreAnswer
title: ScoreAnswer
---

Defined in: [packages/ai/src/activities/evaluate/index.ts:83](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L83)

Public score answer. `.value` is the nearest level label.
`.score` is the raw TypeSafe fraction.

## Type Parameters

### TLevel

`TLevel` *extends* `string` = `string`

## Properties

### confidence

```ts
confidence: number;
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:88](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L88)

***

### legend

```ts
legend: Record<string, string>;
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:90](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L90)

***

### probabilities

```ts
probabilities: Record<string, number>;
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:91](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L91)

***

### probability

```ts
probability: number;
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:87](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L87)

P(nearest level).

***

### score

```ts
score: number;
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:89](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L89)

***

### type

```ts
type: "score";
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:84](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L84)

***

### value

```ts
value: TLevel;
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:85](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L85)

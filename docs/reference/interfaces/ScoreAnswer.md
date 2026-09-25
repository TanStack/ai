---
id: ScoreAnswer
title: ScoreAnswer
---

Defined in: [packages/ai/src/activities/evaluate/index.ts:77](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L77)

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

Defined in: [packages/ai/src/activities/evaluate/index.ts:82](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L82)

***

### legend

```ts
legend: Record<string, string>;
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:84](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L84)

***

### probabilities

```ts
probabilities: Record<string, number>;
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:85](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L85)

***

### probability

```ts
probability: number;
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:81](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L81)

P(nearest level).

***

### score

```ts
score: number;
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:83](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L83)

***

### type

```ts
type: "score";
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:78](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L78)

***

### value

```ts
value: TLevel;
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:79](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L79)

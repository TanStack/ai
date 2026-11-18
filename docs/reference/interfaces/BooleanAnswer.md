---
id: BooleanAnswer
title: BooleanAnswer
---

Defined in: [packages/ai/src/activities/evaluate/index.ts:98](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L98)

Public yes/no answer. `.value` is `true` when P(true) is 0.5 or more.
There is no `.confidence`.

## Properties

### probability

```ts
probability: number;
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:102](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L102)

P(true), from the wire `noul` field.

***

### type

```ts
type: "boolean";
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:99](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L99)

***

### value

```ts
value: boolean;
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:100](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L100)

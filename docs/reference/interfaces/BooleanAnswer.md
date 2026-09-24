---
id: BooleanAnswer
title: BooleanAnswer
---

Defined in: [packages/ai/src/activities/evaluate/index.ts:92](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L92)

Public yes/no answer. `.value` is `true` when P(true) is 0.5 or more.
There is no `.confidence`.

## Properties

### probability

```ts
probability: number;
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:96](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L96)

P(true), from the wire `noul` field.

***

### type

```ts
type: "boolean";
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:93](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L93)

***

### value

```ts
value: boolean;
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:94](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L94)

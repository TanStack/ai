---
id: BooleanAnswer
title: BooleanAnswer
---

Defined in: packages/ai/src/activities/evaluate/index.ts:92

Public yes/no answer. `.value` is `true` when P(true) is 0.5 or more.
There is no `.confidence`.

## Properties

### probability

```ts
probability: number;
```

Defined in: packages/ai/src/activities/evaluate/index.ts:96

P(true), from the wire `noul` field.

***

### type

```ts
type: "boolean";
```

Defined in: packages/ai/src/activities/evaluate/index.ts:93

***

### value

```ts
value: boolean;
```

Defined in: packages/ai/src/activities/evaluate/index.ts:94

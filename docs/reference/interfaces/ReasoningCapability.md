---
id: ReasoningCapability
title: ReasoningCapability
---

Defined in: packages/ai/src/reasoning.ts:36

What a model supports, at the type level. Adapters declare it per model in
`'~types'.reasoning`. `levels` is a union of the model's levels. `budget`
says whether the model takes a thinking token budget.

## Properties

### budget

```ts
budget: boolean;
```

Defined in: packages/ai/src/reasoning.ts:38

***

### levels

```ts
levels: ReasoningLevel;
```

Defined in: packages/ai/src/reasoning.ts:37

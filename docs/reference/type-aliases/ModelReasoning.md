---
id: ModelReasoning
title: ModelReasoning
---

```ts
type ModelReasoning = 
  | false
  | {
  budget: boolean;
  levels: ReasoningLevels;
};
```

Defined in: packages/ai/src/reasoning.ts:82

A model's reasoning data at runtime. `false`: the model does not reason.
Otherwise the levels it has, and whether it takes a token budget.

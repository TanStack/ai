---
id: ReasoningLevels
title: ReasoningLevels
---

```ts
type ReasoningLevels = Partial<Record<ReasoningLevel, string>>;
```

Defined in: [packages/ai/src/reasoning.ts:29](https://github.com/TanStack/ai/blob/main/packages/ai/src/reasoning.ts#L29)

A model's levels: the provider value to send for each level the model has.
A level with no entry is not supported.

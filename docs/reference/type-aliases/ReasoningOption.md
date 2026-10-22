---
id: ReasoningOption
title: ReasoningOption
---

```ts
type ReasoningOption<TCapability> = 
  | TCapability["levels"]
  | object & true extends TCapability["budget"] ? object : object;
```

Defined in: packages/ai/src/reasoning.ts:46

The `reasoning` option of `chat()`: a level, or an object. `summary` asks
the provider to stream the thinking text (default `true`). `budgetTokens`
sets an exact thinking budget, on models that take one.

## Type Parameters

### TCapability

`TCapability` *extends* [`ReasoningCapability`](../interfaces/ReasoningCapability.md) = [`ReasoningCapability`](../interfaces/ReasoningCapability.md)

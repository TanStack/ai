---
id: clampReasoningLevel
title: clampReasoningLevel
---

```ts
function clampReasoningLevel(reasoning, level): ReasoningLevel;
```

Defined in: packages/ai/src/reasoning.ts:128

A level the model supports: the level itself, else the nearest supported
level above it, else the nearest below it, else `off`. The same rule as pi.

## Parameters

### reasoning

[`ModelReasoning`](../type-aliases/ModelReasoning.md) \| `undefined`

### level

[`ReasoningLevel`](../type-aliases/ReasoningLevel.md)

## Returns

[`ReasoningLevel`](../type-aliases/ReasoningLevel.md)

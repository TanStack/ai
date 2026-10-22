---
id: supportedReasoningLevels
title: supportedReasoningLevels
---

```ts
function supportedReasoningLevels(reasoning): readonly ReasoningLevel[];
```

Defined in: packages/ai/src/reasoning.ts:117

The levels a model supports, from least to most thinking: the levels in its
data. A model that does not reason, or has no data, supports only `off`.

## Parameters

### reasoning

[`ModelReasoning`](../type-aliases/ModelReasoning.md) \| `undefined`

## Returns

readonly [`ReasoningLevel`](../type-aliases/ReasoningLevel.md)[]

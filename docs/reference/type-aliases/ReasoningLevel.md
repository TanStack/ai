---
id: ReasoningLevel
title: ReasoningLevel
---

```ts
type ReasoningLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
```

Defined in: packages/ai/src/reasoning.ts:5

How hard a model thinks. `off` asks for no thinking. The levels are ordered
from least to most, and the clamp rule walks this order.

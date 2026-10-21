---
id: EmbeddingModelInputModalitiesByName
title: EmbeddingModelInputModalitiesByName
---

```ts
type EmbeddingModelInputModalitiesByName = Record<string, ReadonlyArray<EmbeddingModality>>;
```

Defined in: packages/ai/src/types.ts:3240

Per-model map from model name to the input modalities it accepts, used as
an adapter type parameter (`TModelInputModalitiesByName`). Models absent
from the map fall back to the unconstrained [EmbeddingInputItem](EmbeddingInputItem.md).

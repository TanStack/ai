---
id: EmbeddingModelInputModalitiesByName
title: EmbeddingModelInputModalitiesByName
---

# Type Alias: EmbeddingModelInputModalitiesByName

```ts
type EmbeddingModelInputModalitiesByName = Record<string, ReadonlyArray<EmbeddingModality>>;
```

Defined in: [packages/ai/src/types.ts:2659](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2659)

Per-model map from model name to the input modalities it accepts, used as
an adapter type parameter (`TModelInputModalitiesByName`). Models absent
from the map fall back to the unconstrained [EmbeddingInputItem](EmbeddingInputItem.md).

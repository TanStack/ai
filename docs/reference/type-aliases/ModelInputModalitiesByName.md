---
id: ModelInputModalitiesByName
title: ModelInputModalitiesByName
---

# Type Alias: ModelInputModalitiesByName

```ts
type ModelInputModalitiesByName = Record<string, ReadonlyArray<MediaPromptModality>>;
```

Defined in: [packages/ai/src/types.ts:1927](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1927)

Per-model map from model name to the prompt modalities it accepts, used as
an adapter type parameter (`TModelInputModalitiesByName`). Models absent
from the map fall back to the unconstrained [MediaPrompt](MediaPrompt.md).

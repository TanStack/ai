---
id: ModalitiesArrayToUnion
title: ModalitiesArrayToUnion
---

```ts
type ModalitiesArrayToUnion<T> = T[number];
```

Defined in: [packages/ai/src/types.ts:360](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L360)

Helper type to convert a readonly array of modalities to a union type.
e.g., readonly ['text', 'image'] -> 'text' | 'image'

## Type Parameters

### T

`T` *extends* `ReadonlyArray`\<[`Modality`](Modality.md)\>

---
id: ModalitiesArrayToUnion
title: ModalitiesArrayToUnion
---

# Type Alias: ModalitiesArrayToUnion\<T\>

```ts
type ModalitiesArrayToUnion<T> = T[number];
```

Defined in: [types.ts:192](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L192)

Helper type to convert a readonly array of modalities to a union type.
e.g., readonly ['text', 'image'] -> 'text' | 'image'

## Type Parameters

### T

`T` *extends* `ReadonlyArray`\<[`Modality`](Modality.md)\>

---
id: withTanstackMetadata
title: withTanstackMetadata
---

```ts
function withTanstackMetadata<T>(value, tanstack): Omit<T, "metadata"> & object;
```

Defined in: packages/ai/src/utilities/merge-metadata.ts:46

## Type Parameters

### T

`T`

## Parameters

### value

`T` & `object`

### tanstack

`MetadataRecord`

## Returns

`Omit`\<`T`, `"metadata"`\> & `object`

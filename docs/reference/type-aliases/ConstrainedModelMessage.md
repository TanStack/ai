---
id: ConstrainedModelMessage
title: ConstrainedModelMessage
---

# Type Alias: ConstrainedModelMessage\<TModalities, TImageMeta, TAudioMeta, TVideoMeta, TDocumentMeta, TTextMeta\>

```ts
type ConstrainedModelMessage<TModalities, TImageMeta, TAudioMeta, TVideoMeta, TDocumentMeta, TTextMeta> = Omit<ModelMessage, "content"> & object;
```

Defined in: [types.ts:234](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L234)

A ModelMessage with content constrained to only allow content parts
matching the specified input modalities.

## Type Declaration

### content

```ts
content: ConstrainedContent<TModalities, TImageMeta, TAudioMeta, TVideoMeta, TDocumentMeta, TTextMeta>;
```

## Type Parameters

### TModalities

`TModalities` *extends* `ReadonlyArray`\<[`Modality`](Modality.md)\>

### TImageMeta

`TImageMeta` = `unknown`

### TAudioMeta

`TAudioMeta` = `unknown`

### TVideoMeta

`TVideoMeta` = `unknown`

### TDocumentMeta

`TDocumentMeta` = `unknown`

### TTextMeta

`TTextMeta` = `unknown`

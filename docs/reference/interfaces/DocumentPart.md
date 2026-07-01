---
id: DocumentPart
title: DocumentPart
---

# Interface: DocumentPart\<TMetadata\>

Defined in: [packages/ai/src/types.ts:264](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L264)

Document content part for multimodal messages (e.g., PDFs).

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

Provider-specific metadata type (e.g., Anthropic's media_type)

## Properties

### metadata?

```ts
optional metadata: TMetadata;
```

Defined in: [packages/ai/src/types.ts:269](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L269)

Provider-specific metadata (e.g., media_type for PDFs)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/ai/src/types.ts:267](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L267)

Source of the document content

***

### type

```ts
type: "document";
```

Defined in: [packages/ai/src/types.ts:265](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L265)

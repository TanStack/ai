---
id: DocumentPart
title: DocumentPart
---

# Interface: DocumentPart\<TMetadata\>

Defined in: [packages/ai/src/types.ts:263](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L263)

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

Defined in: [packages/ai/src/types.ts:268](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L268)

Provider-specific metadata (e.g., media_type for PDFs)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/ai/src/types.ts:266](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L266)

Source of the document content

***

### type

```ts
type: "document";
```

Defined in: [packages/ai/src/types.ts:264](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L264)

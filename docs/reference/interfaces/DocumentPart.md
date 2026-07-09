---
id: DocumentPart
title: DocumentPart
---

# Interface: DocumentPart\<TMetadata\>

Defined in: [packages/ai/src/types.ts:287](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L287)

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

Defined in: [packages/ai/src/types.ts:292](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L292)

Provider-specific metadata (e.g., media_type for PDFs)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/ai/src/types.ts:290](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L290)

Source of the document content

***

### type

```ts
type: "document";
```

Defined in: [packages/ai/src/types.ts:288](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L288)

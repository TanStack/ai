---
id: DocumentPart
title: DocumentPart
---

# Interface: DocumentPart\<TMetadata\>

Defined in: [types.ts:90](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L90)

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

Defined in: [types.ts:95](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L95)

Provider-specific metadata (e.g., media_type for PDFs)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [types.ts:93](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L93)

Source of the document content

***

### type

```ts
type: "document";
```

Defined in: [types.ts:91](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L91)

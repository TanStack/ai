---
id: DocumentPart
title: DocumentPart
---

Defined in: [packages/ai/src/types.ts:285](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L285)

Document content part for multimodal messages (e.g., PDFs). AG-UI `DocumentPart` with typed metadata.

## Extends

- `DocumentPart`

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

Provider-specific metadata type (e.g., Anthropic's media_type)

## Properties

### metadata?

```ts
optional metadata?: TMetadata;
```

Defined in: [packages/ai/src/types.ts:287](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L287)

Provider-specific metadata (e.g., media_type for PDFs)

#### Overrides

```ts
AGUIDocumentPart.metadata
```

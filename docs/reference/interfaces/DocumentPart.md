---
id: DocumentPart
title: DocumentPart
---

Defined in: [packages/ai/src/types.ts:314](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L314)

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

Defined in: [packages/ai/src/types.ts:316](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L316)

Provider-specific metadata (e.g., media_type for PDFs)

#### Overrides

```ts
AGUIDocumentPart.metadata
```

---
id: DocumentPart
title: DocumentPart
---

# Interface: DocumentPart\<TMetadata\>

Defined in: [packages/ai/src/types.ts:297](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L297)

Document content part for multimodal messages (e.g., PDFs).

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

Provider-specific metadata type (e.g., Anthropic's media_type)

## Properties

### metadata?

```ts
optional metadata?: TMetadata;
```

Defined in: [packages/ai/src/types.ts:302](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L302)

Provider-specific metadata (e.g., media_type for PDFs)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/ai/src/types.ts:300](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L300)

Source of the document content

***

### type

```ts
type: "document";
```

Defined in: [packages/ai/src/types.ts:298](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L298)

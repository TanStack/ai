---
id: DocumentPart
title: DocumentPart
---

# Interface: DocumentPart\<TMetadata\>

Defined in: [packages/typescript/ai/src/types.ts:228](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L228)

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

Defined in: [packages/typescript/ai/src/types.ts:233](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L233)

Provider-specific metadata (e.g., media_type for PDFs)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/typescript/ai/src/types.ts:231](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L231)

Source of the document content

***

### type

```ts
type: "document";
```

Defined in: [packages/typescript/ai/src/types.ts:229](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L229)

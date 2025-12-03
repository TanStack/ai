---
id: DocumentPart
title: DocumentPart
---

# Interface: DocumentPart\<TMetadata\>

Defined in: [types.ts:87](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L87)

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

Defined in: [types.ts:92](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L92)

Provider-specific metadata (e.g., media_type for PDFs)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [types.ts:90](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L90)

Source of the document content

***

### type

```ts
type: "document";
```

Defined in: [types.ts:88](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L88)

---
id: DocumentPart
title: DocumentPart
---

# Interface: DocumentPart\<TMetadata\>

Defined in: [types.ts:220](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L220)

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

Defined in: [types.ts:225](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L225)

Provider-specific metadata (e.g., media_type for PDFs)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [types.ts:223](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L223)

Source of the document content

***

### type

```ts
type: "document";
```

Defined in: [types.ts:221](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L221)

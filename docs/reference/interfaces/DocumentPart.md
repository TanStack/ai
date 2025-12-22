---
id: DocumentPart
title: DocumentPart
---

# Interface: DocumentPart\<TMetadata\>

Defined in: [types.ts:160](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L160)

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

Defined in: [types.ts:165](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L165)

Provider-specific metadata (e.g., media_type for PDFs)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [types.ts:163](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L163)

Source of the document content

***

### type

```ts
type: "document";
```

Defined in: [types.ts:161](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L161)

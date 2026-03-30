---
id: DocumentPart
title: DocumentPart
---

# Interface: DocumentPart\<TMetadata\>

Defined in: [types.ts:199](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L199)

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

Defined in: [types.ts:204](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L204)

Provider-specific metadata (e.g., media_type for PDFs)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [types.ts:202](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L202)

Source of the document content

***

### type

```ts
type: "document";
```

Defined in: [types.ts:200](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L200)

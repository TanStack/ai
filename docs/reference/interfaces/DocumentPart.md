---
id: DocumentPart
title: DocumentPart
---

# Interface: DocumentPart\<TMetadata\>

Defined in: [packages/ai/src/types.ts:284](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L284)

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

Defined in: [packages/ai/src/types.ts:289](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L289)

Provider-specific metadata (e.g., media_type for PDFs)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/ai/src/types.ts:287](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L287)

Source of the document content

***

### type

```ts
type: "document";
```

Defined in: [packages/ai/src/types.ts:285](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L285)

---
id: DocumentPart
title: DocumentPart
---

# Interface: DocumentPart\<TMetadata\>

Defined in: [packages/typescript/ai/src/types.ts:249](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L249)

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

Defined in: [packages/typescript/ai/src/types.ts:254](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L254)

Provider-specific metadata (e.g., media_type for PDFs)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/typescript/ai/src/types.ts:252](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L252)

Source of the document content

***

### type

```ts
type: "document";
```

Defined in: [packages/typescript/ai/src/types.ts:250](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L250)

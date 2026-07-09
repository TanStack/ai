---
id: ImagePart
title: ImagePart
---

# Interface: ImagePart\<TMetadata\>

Defined in: [packages/ai/src/types.ts:251](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L251)

Image content part for multimodal messages.

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

Provider-specific metadata type (e.g., OpenAI's detail level)

## Properties

### metadata?

```ts
optional metadata: TMetadata;
```

Defined in: [packages/ai/src/types.ts:256](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L256)

Provider-specific metadata (e.g., OpenAI's detail: 'auto' | 'low' | 'high')

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/ai/src/types.ts:254](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L254)

Source of the image content

***

### type

```ts
type: "image";
```

Defined in: [packages/ai/src/types.ts:252](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L252)

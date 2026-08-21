---
id: ImagePart
title: ImagePart
---

# Interface: ImagePart\<TMetadata\>

Defined in: [packages/ai/src/types.ts:261](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L261)

Image content part for multimodal messages.

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

Provider-specific metadata type (e.g., OpenAI's detail level)

## Properties

### metadata?

```ts
optional metadata?: TMetadata;
```

Defined in: [packages/ai/src/types.ts:266](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L266)

Provider-specific metadata (e.g., OpenAI's detail: 'auto' | 'low' | 'high')

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/ai/src/types.ts:264](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L264)

Source of the image content

***

### type

```ts
type: "image";
```

Defined in: [packages/ai/src/types.ts:262](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L262)

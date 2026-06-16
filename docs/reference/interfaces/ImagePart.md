---
id: ImagePart
title: ImagePart
---

# Interface: ImagePart\<TMetadata\>

Defined in: [packages/ai/src/types.ts:227](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L227)

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

Defined in: [packages/ai/src/types.ts:232](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L232)

Provider-specific metadata (e.g., OpenAI's detail: 'auto' | 'low' | 'high')

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/ai/src/types.ts:230](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L230)

Source of the image content

***

### type

```ts
type: "image";
```

Defined in: [packages/ai/src/types.ts:228](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L228)

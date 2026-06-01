---
id: ImagePart
title: ImagePart
---

# Interface: ImagePart\<TMetadata\>

Defined in: [packages/ai/src/types.ts:226](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L226)

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

Defined in: [packages/ai/src/types.ts:231](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L231)

Provider-specific metadata (e.g., OpenAI's detail: 'auto' | 'low' | 'high')

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/ai/src/types.ts:229](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L229)

Source of the image content

***

### type

```ts
type: "image";
```

Defined in: [packages/ai/src/types.ts:227](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L227)

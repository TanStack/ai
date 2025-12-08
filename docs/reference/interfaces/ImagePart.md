---
id: ImagePart
title: ImagePart
---

# Interface: ImagePart\<TMetadata\>

Defined in: [types.ts:54](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L54)

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

Defined in: [types.ts:59](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L59)

Provider-specific metadata (e.g., OpenAI's detail: 'auto' | 'low' | 'high')

***

### source

```ts
source: ContentPartSource;
```

Defined in: [types.ts:57](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L57)

Source of the image content

***

### type

```ts
type: "image";
```

Defined in: [types.ts:55](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L55)

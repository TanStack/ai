---
id: ImagePart
title: ImagePart
---

# Interface: ImagePart\<TMetadata\>

Defined in: [types.ts:108](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L108)

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

Defined in: [types.ts:113](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L113)

Provider-specific metadata (e.g., OpenAI's detail: 'auto' | 'low' | 'high')

***

### source

```ts
source: ContentPartSource;
```

Defined in: [types.ts:111](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L111)

Source of the image content

***

### type

```ts
type: "image";
```

Defined in: [types.ts:109](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L109)

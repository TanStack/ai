---
id: ImagePart
title: ImagePart
---

# Interface: ImagePart\<TMetadata\>

Defined in: [types.ts:161](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L161)

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

Defined in: [types.ts:166](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L166)

Provider-specific metadata (e.g., OpenAI's detail: 'auto' | 'low' | 'high')

***

### source

```ts
source: ContentPartSource;
```

Defined in: [types.ts:164](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L164)

Source of the image content

***

### type

```ts
type: "image";
```

Defined in: [types.ts:162](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L162)

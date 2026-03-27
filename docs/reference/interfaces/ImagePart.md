---
id: ImagePart
title: ImagePart
---

# Interface: ImagePart\<TMetadata\>

Defined in: [types.ts:163](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L163)

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

Defined in: [types.ts:168](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L168)

Provider-specific metadata (e.g., OpenAI's detail: 'auto' | 'low' | 'high')

***

### source

```ts
source: ContentPartSource;
```

Defined in: [types.ts:166](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L166)

Source of the image content

***

### type

```ts
type: "image";
```

Defined in: [types.ts:164](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L164)

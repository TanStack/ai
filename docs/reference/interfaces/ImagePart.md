---
id: ImagePart
title: ImagePart
---

# Interface: ImagePart\<TMetadata\>

Defined in: [types.ts:184](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L184)

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

Defined in: [types.ts:189](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L189)

Provider-specific metadata (e.g., OpenAI's detail: 'auto' | 'low' | 'high')

***

### source

```ts
source: ContentPartSource;
```

Defined in: [types.ts:187](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L187)

Source of the image content

***

### type

```ts
type: "image";
```

Defined in: [types.ts:185](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L185)

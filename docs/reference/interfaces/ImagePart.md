---
id: ImagePart
title: ImagePart
---

# Interface: ImagePart\<TMetadata\>

Defined in: [types.ts:51](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L51)

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

Defined in: [types.ts:56](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L56)

Provider-specific metadata (e.g., OpenAI's detail: 'auto' | 'low' | 'high')

***

### source

```ts
source: ContentPartSource;
```

Defined in: [types.ts:54](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L54)

Source of the image content

***

### type

```ts
type: "image";
```

Defined in: [types.ts:52](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L52)

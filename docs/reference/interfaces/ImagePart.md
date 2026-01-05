---
id: ImagePart
title: ImagePart
---

# Interface: ImagePart\<TMetadata\>

Defined in: [types.ts:133](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L133)

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

Defined in: [types.ts:138](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L138)

Provider-specific metadata (e.g., OpenAI's detail: 'auto' | 'low' | 'high')

***

### source

```ts
source: ContentPartSource;
```

Defined in: [types.ts:136](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L136)

Source of the image content

***

### type

```ts
type: "image";
```

Defined in: [types.ts:134](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L134)

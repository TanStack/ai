---
id: ImagePart
title: ImagePart
---

# Interface: ImagePart\<TMetadata\>

Defined in: [packages/ai/src/types.ts:248](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L248)

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

Defined in: [packages/ai/src/types.ts:253](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L253)

Provider-specific metadata (e.g., OpenAI's detail: 'auto' | 'low' | 'high')

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/ai/src/types.ts:251](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L251)

Source of the image content

***

### type

```ts
type: "image";
```

Defined in: [packages/ai/src/types.ts:249](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L249)

---
id: ImagePart
title: ImagePart
---

# Interface: ImagePart\<TMetadata\>

Defined in: [packages/ai/src/types.ts:216](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L216)

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

Defined in: [packages/ai/src/types.ts:221](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L221)

Provider-specific metadata (e.g., OpenAI's detail: 'auto' | 'low' | 'high')

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/ai/src/types.ts:219](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L219)

Source of the image content

***

### type

```ts
type: "image";
```

Defined in: [packages/ai/src/types.ts:217](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L217)

---
id: ImagePart
title: ImagePart
---

# Interface: ImagePart\<TMetadata\>

Defined in: [packages/typescript/ai/src/types.ts:214](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L214)

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

Defined in: [packages/typescript/ai/src/types.ts:219](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L219)

Provider-specific metadata (e.g., OpenAI's detail: 'auto' | 'low' | 'high')

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/typescript/ai/src/types.ts:217](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L217)

Source of the image content

***

### type

```ts
type: "image";
```

Defined in: [packages/typescript/ai/src/types.ts:215](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L215)

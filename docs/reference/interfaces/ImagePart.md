---
id: ImagePart
title: ImagePart
---

# Interface: ImagePart\<TMetadata\>

Defined in: [packages/typescript/ai/src/types.ts:212](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L212)

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

Defined in: [packages/typescript/ai/src/types.ts:217](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L217)

Provider-specific metadata (e.g., OpenAI's detail: 'auto' | 'low' | 'high')

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/typescript/ai/src/types.ts:215](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L215)

Source of the image content

***

### type

```ts
type: "image";
```

Defined in: [packages/typescript/ai/src/types.ts:213](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L213)

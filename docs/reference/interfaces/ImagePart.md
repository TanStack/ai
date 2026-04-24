---
id: ImagePart
title: ImagePart
---

# Interface: ImagePart\<TMetadata\>

Defined in: [packages/typescript/ai/src/types.ts:190](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L190)

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

Defined in: [packages/typescript/ai/src/types.ts:195](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L195)

Provider-specific metadata (e.g., OpenAI's detail: 'auto' | 'low' | 'high')

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/typescript/ai/src/types.ts:193](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L193)

Source of the image content

***

### type

```ts
type: "image";
```

Defined in: [packages/typescript/ai/src/types.ts:191](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L191)

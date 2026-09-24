---
id: ImagePart
title: ImagePart
---

Defined in: [packages/ai/src/types.ts:258](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L258)

Image content part for multimodal messages. AG-UI `ImagePart` with typed metadata.

## Extends

- `ImagePart`

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

Provider-specific metadata type (e.g., OpenAI's detail level)

## Properties

### metadata?

```ts
optional metadata?: TMetadata;
```

Defined in: [packages/ai/src/types.ts:260](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L260)

Provider-specific metadata (e.g., OpenAI's detail: 'auto' | 'low' | 'high')

#### Overrides

```ts
AGUIImagePart.metadata
```

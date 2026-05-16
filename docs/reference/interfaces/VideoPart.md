---
id: VideoPart
title: VideoPart
---

# Interface: VideoPart\<TMetadata\>

Defined in: [packages/typescript/ai/src/types.ts:236](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L236)

Video content part for multimodal messages.

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

Provider-specific metadata type

## Properties

### metadata?

```ts
optional metadata: TMetadata;
```

Defined in: [packages/typescript/ai/src/types.ts:241](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L241)

Provider-specific metadata (e.g., duration, resolution)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/typescript/ai/src/types.ts:239](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L239)

Source of the video content

***

### type

```ts
type: "video";
```

Defined in: [packages/typescript/ai/src/types.ts:237](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L237)

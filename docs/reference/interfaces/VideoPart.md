---
id: VideoPart
title: VideoPart
---

# Interface: VideoPart\<TMetadata\>

Defined in: [packages/ai/src/types.ts:272](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L272)

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

Defined in: [packages/ai/src/types.ts:277](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L277)

Provider-specific metadata (e.g., duration, resolution)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/ai/src/types.ts:275](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L275)

Source of the video content

***

### type

```ts
type: "video";
```

Defined in: [packages/ai/src/types.ts:273](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L273)

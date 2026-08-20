---
id: VideoPart
title: VideoPart
---

# Interface: VideoPart\<TMetadata\>

Defined in: [packages/ai/src/types.ts:285](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L285)

Video content part for multimodal messages.

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

Provider-specific metadata type

## Properties

### metadata?

```ts
optional metadata?: TMetadata;
```

Defined in: [packages/ai/src/types.ts:290](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L290)

Provider-specific metadata (e.g., duration, resolution)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/ai/src/types.ts:288](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L288)

Source of the video content

***

### type

```ts
type: "video";
```

Defined in: [packages/ai/src/types.ts:286](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L286)

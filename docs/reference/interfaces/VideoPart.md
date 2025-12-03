---
id: VideoPart
title: VideoPart
---

# Interface: VideoPart\<TMetadata\>

Defined in: [types.ts:77](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L77)

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

Defined in: [types.ts:82](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L82)

Provider-specific metadata (e.g., duration, resolution)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [types.ts:80](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L80)

Source of the video content

***

### type

```ts
type: "video";
```

Defined in: [types.ts:78](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L78)

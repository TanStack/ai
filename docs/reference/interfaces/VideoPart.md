---
id: VideoPart
title: VideoPart
---

# Interface: VideoPart\<TMetadata\>

Defined in: [types.ts:75](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L75)

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

Defined in: [types.ts:80](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L80)

Provider-specific metadata (e.g., duration, resolution)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [types.ts:78](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L78)

Source of the video content

***

### type

```ts
type: "video";
```

Defined in: [types.ts:76](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L76)

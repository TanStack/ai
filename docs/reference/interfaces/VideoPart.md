---
id: VideoPart
title: VideoPart
---

# Interface: VideoPart\<TMetadata\>

Defined in: [types.ts:78](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L78)

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

Defined in: [types.ts:83](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L83)

Provider-specific metadata (e.g., duration, resolution)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [types.ts:81](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L81)

Source of the video content

***

### type

```ts
type: "video";
```

Defined in: [types.ts:79](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L79)

---
id: VideoPart
title: VideoPart
---

# Interface: VideoPart\<TMetadata\>

Defined in: [types.ts:208](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L208)

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

Defined in: [types.ts:213](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L213)

Provider-specific metadata (e.g., duration, resolution)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [types.ts:211](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L211)

Source of the video content

***

### type

```ts
type: "video";
```

Defined in: [types.ts:209](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L209)

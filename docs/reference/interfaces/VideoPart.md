---
id: VideoPart
title: VideoPart
---

# Interface: VideoPart\<TMetadata\>

Defined in: [types.ts:83](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L83)

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

Defined in: [types.ts:88](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L88)

Provider-specific metadata (e.g., duration, resolution)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [types.ts:86](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L86)

Source of the video content

***

### type

```ts
type: "video";
```

Defined in: [types.ts:84](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L84)

---
id: VideoPart
title: VideoPart
---

# Interface: VideoPart\<TMetadata\>

Defined in: [packages/typescript/ai/src/types.ts:237](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L237)

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

Defined in: [packages/typescript/ai/src/types.ts:242](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L242)

Provider-specific metadata (e.g., duration, resolution)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/typescript/ai/src/types.ts:240](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L240)

Source of the video content

***

### type

```ts
type: "video";
```

Defined in: [packages/typescript/ai/src/types.ts:238](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L238)

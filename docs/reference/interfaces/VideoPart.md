---
id: VideoPart
title: VideoPart
---

# Interface: VideoPart\<TMetadata\>

Defined in: [packages/ai/src/types.ts:240](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L240)

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

Defined in: [packages/ai/src/types.ts:245](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L245)

Provider-specific metadata (e.g., duration, resolution)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/ai/src/types.ts:243](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L243)

Source of the video content

***

### type

```ts
type: "video";
```

Defined in: [packages/ai/src/types.ts:241](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L241)

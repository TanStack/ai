---
id: VideoPart
title: VideoPart
---

# Interface: VideoPart\<TMetadata\>

Defined in: [packages/ai/src/types.ts:252](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L252)

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

Defined in: [packages/ai/src/types.ts:257](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L257)

Provider-specific metadata (e.g., duration, resolution)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/ai/src/types.ts:255](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L255)

Source of the video content

***

### type

```ts
type: "video";
```

Defined in: [packages/ai/src/types.ts:253](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L253)

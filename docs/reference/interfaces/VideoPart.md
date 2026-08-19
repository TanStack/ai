---
id: VideoPart
title: VideoPart
---

# Interface: VideoPart\<TMetadata\>

Defined in: [packages/ai/src/types.ts:283](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L283)

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

Defined in: [packages/ai/src/types.ts:288](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L288)

Provider-specific metadata (e.g., duration, resolution)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/ai/src/types.ts:286](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L286)

Source of the video content

***

### type

```ts
type: "video";
```

Defined in: [packages/ai/src/types.ts:284](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L284)

---
id: VideoPart
title: VideoPart
---

# Interface: VideoPart\<TMetadata\>

Defined in: [packages/typescript/ai/src/types.ts:213](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L213)

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

Defined in: [packages/typescript/ai/src/types.ts:218](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L218)

Provider-specific metadata (e.g., duration, resolution)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/typescript/ai/src/types.ts:216](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L216)

Source of the video content

***

### type

```ts
type: "video";
```

Defined in: [packages/typescript/ai/src/types.ts:214](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L214)

---
id: VideoPart
title: VideoPart
---

# Interface: VideoPart\<TMetadata\>

Defined in: [types.ts:157](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L157)

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

Defined in: [types.ts:162](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L162)

Provider-specific metadata (e.g., duration, resolution)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [types.ts:160](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L160)

Source of the video content

***

### type

```ts
type: "video";
```

Defined in: [types.ts:158](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L158)

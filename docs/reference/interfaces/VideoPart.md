---
id: VideoPart
title: VideoPart
---

# Interface: VideoPart\<TMetadata\>

Defined in: [types.ts:132](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L132)

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

Defined in: [types.ts:137](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L137)

Provider-specific metadata (e.g., duration, resolution)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [types.ts:135](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L135)

Source of the video content

***

### type

```ts
type: "video";
```

Defined in: [types.ts:133](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L133)

---
id: VideoPart
title: VideoPart
---

# Interface: VideoPart\<TMetadata\>

Defined in: [types.ts:148](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L148)

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

Defined in: [types.ts:153](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L153)

Provider-specific metadata (e.g., duration, resolution)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [types.ts:151](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L151)

Source of the video content

***

### type

```ts
type: "video";
```

Defined in: [types.ts:149](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L149)

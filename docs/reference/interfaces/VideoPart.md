---
id: VideoPart
title: VideoPart
---

# Interface: VideoPart\<TMetadata\>

Defined in: [types.ts:185](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L185)

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

Defined in: [types.ts:190](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L190)

Provider-specific metadata (e.g., duration, resolution)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [types.ts:188](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L188)

Source of the video content

***

### type

```ts
type: "video";
```

Defined in: [types.ts:186](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L186)

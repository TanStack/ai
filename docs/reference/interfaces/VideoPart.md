---
id: VideoPart
title: VideoPart
---

# Interface: VideoPart\<TMetadata\>

Defined in: [packages/typescript/ai/src/types.ts:214](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L214)

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

Defined in: [packages/typescript/ai/src/types.ts:219](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L219)

Provider-specific metadata (e.g., duration, resolution)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/typescript/ai/src/types.ts:217](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L217)

Source of the video content

***

### type

```ts
type: "video";
```

Defined in: [packages/typescript/ai/src/types.ts:215](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L215)

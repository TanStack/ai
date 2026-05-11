---
id: VideoPart
title: VideoPart
---

# Interface: VideoPart\<TMetadata\>

Defined in: [packages/typescript/ai/src/types.ts:216](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L216)

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

Defined in: [packages/typescript/ai/src/types.ts:221](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L221)

Provider-specific metadata (e.g., duration, resolution)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/typescript/ai/src/types.ts:219](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L219)

Source of the video content

***

### type

```ts
type: "video";
```

Defined in: [packages/typescript/ai/src/types.ts:217](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L217)

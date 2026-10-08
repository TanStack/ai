---
id: VideoPart
title: VideoPart
---

Defined in: [packages/ai/src/types.ts:305](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L305)

Video content part for multimodal messages. AG-UI `VideoPart` with typed metadata.

## Extends

- `VideoPart`

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

Provider-specific metadata type

## Properties

### metadata?

```ts
optional metadata?: TMetadata;
```

Defined in: [packages/ai/src/types.ts:307](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L307)

Provider-specific metadata (e.g., duration, resolution)

#### Overrides

```ts
AGUIVideoPart.metadata
```

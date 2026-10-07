---
id: AudioPart
title: AudioPart
---

Defined in: [packages/ai/src/types.ts:296](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L296)

Audio content part for multimodal messages. AG-UI `AudioPart` with typed metadata.

## Extends

- `AudioPart`

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

Provider-specific metadata type

## Properties

### metadata?

```ts
optional metadata?: TMetadata;
```

Defined in: [packages/ai/src/types.ts:298](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L298)

Provider-specific metadata (e.g., format, sample rate)

#### Overrides

```ts
AGUIAudioPart.metadata
```

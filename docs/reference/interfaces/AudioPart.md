---
id: AudioPart
title: AudioPart
---

# Interface: AudioPart\<TMetadata\>

Defined in: [packages/ai/src/types.ts:263](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L263)

Audio content part for multimodal messages.

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

Provider-specific metadata type

## Properties

### metadata?

```ts
optional metadata: TMetadata;
```

Defined in: [packages/ai/src/types.ts:268](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L268)

Provider-specific metadata (e.g., format, sample rate)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/ai/src/types.ts:266](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L266)

Source of the audio content

***

### type

```ts
type: "audio";
```

Defined in: [packages/ai/src/types.ts:264](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L264)

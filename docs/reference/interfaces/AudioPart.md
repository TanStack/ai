---
id: AudioPart
title: AudioPart
---

# Interface: AudioPart\<TMetadata\>

Defined in: [packages/ai/src/types.ts:276](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L276)

Audio content part for multimodal messages.

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

Provider-specific metadata type

## Properties

### metadata?

```ts
optional metadata?: TMetadata;
```

Defined in: [packages/ai/src/types.ts:281](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L281)

Provider-specific metadata (e.g., format, sample rate)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/ai/src/types.ts:279](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L279)

Source of the audio content

***

### type

```ts
type: "audio";
```

Defined in: [packages/ai/src/types.ts:277](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L277)

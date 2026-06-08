---
id: AudioPart
title: AudioPart
---

# Interface: AudioPart\<TMetadata\>

Defined in: [packages/ai/src/types.ts:238](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L238)

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

Defined in: [packages/ai/src/types.ts:243](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L243)

Provider-specific metadata (e.g., format, sample rate)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/ai/src/types.ts:241](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L241)

Source of the audio content

***

### type

```ts
type: "audio";
```

Defined in: [packages/ai/src/types.ts:239](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L239)

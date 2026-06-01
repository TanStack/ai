---
id: AudioPart
title: AudioPart
---

# Interface: AudioPart\<TMetadata\>

Defined in: [packages/ai/src/types.ts:228](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L228)

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

Defined in: [packages/ai/src/types.ts:233](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L233)

Provider-specific metadata (e.g., format, sample rate)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/ai/src/types.ts:231](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L231)

Source of the audio content

***

### type

```ts
type: "audio";
```

Defined in: [packages/ai/src/types.ts:229](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L229)

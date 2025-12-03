---
id: AudioPart
title: AudioPart
---

# Interface: AudioPart\<TMetadata\>

Defined in: [types.ts:63](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L63)

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

Defined in: [types.ts:68](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L68)

Provider-specific metadata (e.g., format, sample rate)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [types.ts:66](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L66)

Source of the audio content

***

### type

```ts
type: "audio";
```

Defined in: [types.ts:64](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L64)

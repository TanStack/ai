---
id: AudioPart
title: AudioPart
---

# Interface: AudioPart\<TMetadata\>

Defined in: [types.ts:71](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L71)

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

Defined in: [types.ts:76](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L76)

Provider-specific metadata (e.g., format, sample rate)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [types.ts:74](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L74)

Source of the audio content

***

### type

```ts
type: "audio";
```

Defined in: [types.ts:72](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L72)

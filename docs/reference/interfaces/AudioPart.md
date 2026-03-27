---
id: AudioPart
title: AudioPart
---

# Interface: AudioPart\<TMetadata\>

Defined in: [types.ts:175](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L175)

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

Defined in: [types.ts:180](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L180)

Provider-specific metadata (e.g., format, sample rate)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [types.ts:178](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L178)

Source of the audio content

***

### type

```ts
type: "audio";
```

Defined in: [types.ts:176](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L176)

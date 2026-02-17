---
id: AudioPart
title: AudioPart
---

# Interface: AudioPart\<TMetadata\>

Defined in: [types.ts:173](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L173)

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

Defined in: [types.ts:178](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L178)

Provider-specific metadata (e.g., format, sample rate)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [types.ts:176](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L176)

Source of the audio content

***

### type

```ts
type: "audio";
```

Defined in: [types.ts:174](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L174)

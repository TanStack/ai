---
id: AudioPart
title: AudioPart
---

# Interface: AudioPart\<TMetadata\>

Defined in: [types.ts:145](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L145)

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

Defined in: [types.ts:150](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L150)

Provider-specific metadata (e.g., format, sample rate)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [types.ts:148](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L148)

Source of the audio content

***

### type

```ts
type: "audio";
```

Defined in: [types.ts:146](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L146)

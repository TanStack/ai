---
id: AudioPart
title: AudioPart
---

# Interface: AudioPart\<TMetadata\>

Defined in: [types.ts:120](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L120)

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

Defined in: [types.ts:125](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L125)

Provider-specific metadata (e.g., format, sample rate)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [types.ts:123](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L123)

Source of the audio content

***

### type

```ts
type: "audio";
```

Defined in: [types.ts:121](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L121)

---
id: AudioPart
title: AudioPart
---

# Interface: AudioPart\<TMetadata\>

Defined in: [packages/ai/src/types.ts:260](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L260)

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

Defined in: [packages/ai/src/types.ts:265](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L265)

Provider-specific metadata (e.g., format, sample rate)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/ai/src/types.ts:263](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L263)

Source of the audio content

***

### type

```ts
type: "audio";
```

Defined in: [packages/ai/src/types.ts:261](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L261)

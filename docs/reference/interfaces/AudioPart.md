---
id: AudioPart
title: AudioPart
---

# Interface: AudioPart\<TMetadata\>

Defined in: [types.ts:196](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L196)

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

Defined in: [types.ts:201](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L201)

Provider-specific metadata (e.g., format, sample rate)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [types.ts:199](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L199)

Source of the audio content

***

### type

```ts
type: "audio";
```

Defined in: [types.ts:197](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L197)

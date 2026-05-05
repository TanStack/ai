---
id: AudioPart
title: AudioPart
---

# Interface: AudioPart\<TMetadata\>

Defined in: [packages/typescript/ai/src/types.ts:202](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L202)

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

Defined in: [packages/typescript/ai/src/types.ts:207](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L207)

Provider-specific metadata (e.g., format, sample rate)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/typescript/ai/src/types.ts:205](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L205)

Source of the audio content

***

### type

```ts
type: "audio";
```

Defined in: [packages/typescript/ai/src/types.ts:203](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L203)

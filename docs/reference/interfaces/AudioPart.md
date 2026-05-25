---
id: AudioPart
title: AudioPart
---

# Interface: AudioPart\<TMetadata\>

Defined in: [packages/typescript/ai/src/types.ts:226](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L226)

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

Defined in: [packages/typescript/ai/src/types.ts:231](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L231)

Provider-specific metadata (e.g., format, sample rate)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [packages/typescript/ai/src/types.ts:229](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L229)

Source of the audio content

***

### type

```ts
type: "audio";
```

Defined in: [packages/typescript/ai/src/types.ts:227](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L227)

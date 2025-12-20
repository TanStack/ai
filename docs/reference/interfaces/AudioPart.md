---
id: AudioPart
title: AudioPart
---

# Interface: AudioPart\<TMetadata\>

Defined in: [types.ts:136](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L136)

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

Defined in: [types.ts:141](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L141)

Provider-specific metadata (e.g., format, sample rate)

***

### source

```ts
source: ContentPartSource;
```

Defined in: [types.ts:139](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L139)

Source of the audio content

***

### type

```ts
type: "audio";
```

Defined in: [types.ts:137](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L137)

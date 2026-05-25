---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [packages/typescript/ai/src/types.ts:1721](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1721)

Result of audio transcription.

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1731](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1731)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1723](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1723)

Unique identifier for the transcription

***

### language?

```ts
optional language: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1729](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1729)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1725](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1725)

Model used for transcription

***

### segments?

```ts
optional segments: TranscriptionSegment[];
```

Defined in: [packages/typescript/ai/src/types.ts:1733](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1733)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1727](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1727)

The full transcribed text

***

### words?

```ts
optional words: TranscriptionWord[];
```

Defined in: [packages/typescript/ai/src/types.ts:1735](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1735)

Word-level timestamps, if available

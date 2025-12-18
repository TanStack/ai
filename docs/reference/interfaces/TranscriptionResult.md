---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [types.ts:998](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L998)

Result of audio transcription.

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [types.ts:1008](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1008)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [types.ts:1000](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1000)

Unique identifier for the transcription

***

### language?

```ts
optional language: string;
```

Defined in: [types.ts:1006](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1006)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [types.ts:1002](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1002)

Model used for transcription

***

### segments?

```ts
optional segments: TranscriptionSegment[];
```

Defined in: [types.ts:1010](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1010)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [types.ts:1004](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1004)

The full transcribed text

***

### words?

```ts
optional words: TranscriptionWord[];
```

Defined in: [types.ts:1012](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1012)

Word-level timestamps, if available

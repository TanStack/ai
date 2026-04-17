---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [types.ts:1233](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1233)

Result of audio transcription.

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [types.ts:1243](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1243)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [types.ts:1235](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1235)

Unique identifier for the transcription

***

### language?

```ts
optional language: string;
```

Defined in: [types.ts:1241](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1241)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [types.ts:1237](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1237)

Model used for transcription

***

### segments?

```ts
optional segments: TranscriptionSegment[];
```

Defined in: [types.ts:1245](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1245)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [types.ts:1239](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1239)

The full transcribed text

***

### words?

```ts
optional words: TranscriptionWord[];
```

Defined in: [types.ts:1247](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1247)

Word-level timestamps, if available

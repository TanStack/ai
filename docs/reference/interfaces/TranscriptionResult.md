---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [types.ts:982](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L982)

Result of audio transcription.

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [types.ts:992](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L992)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [types.ts:984](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L984)

Unique identifier for the transcription

***

### language?

```ts
optional language: string;
```

Defined in: [types.ts:990](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L990)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [types.ts:986](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L986)

Model used for transcription

***

### segments?

```ts
optional segments: TranscriptionSegment[];
```

Defined in: [types.ts:994](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L994)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [types.ts:988](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L988)

The full transcribed text

***

### words?

```ts
optional words: TranscriptionWord[];
```

Defined in: [types.ts:996](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L996)

Word-level timestamps, if available

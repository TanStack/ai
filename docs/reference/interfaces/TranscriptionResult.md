---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [packages/typescript/ai/src/types.ts:1510](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1510)

Result of audio transcription.

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1520](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1520)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1512](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1512)

Unique identifier for the transcription

***

### language?

```ts
optional language: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1518](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1518)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1514](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1514)

Model used for transcription

***

### segments?

```ts
optional segments: TranscriptionSegment[];
```

Defined in: [packages/typescript/ai/src/types.ts:1522](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1522)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1516](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1516)

The full transcribed text

***

### words?

```ts
optional words: TranscriptionWord[];
```

Defined in: [packages/typescript/ai/src/types.ts:1524](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1524)

Word-level timestamps, if available

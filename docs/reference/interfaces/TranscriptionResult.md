---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [packages/typescript/ai/src/types.ts:1518](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1518)

Result of audio transcription.

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1528](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1528)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1520](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1520)

Unique identifier for the transcription

***

### language?

```ts
optional language: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1526](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1526)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1522](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1522)

Model used for transcription

***

### segments?

```ts
optional segments: TranscriptionSegment[];
```

Defined in: [packages/typescript/ai/src/types.ts:1530](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1530)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1524](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1524)

The full transcribed text

***

### words?

```ts
optional words: TranscriptionWord[];
```

Defined in: [packages/typescript/ai/src/types.ts:1532](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1532)

Word-level timestamps, if available

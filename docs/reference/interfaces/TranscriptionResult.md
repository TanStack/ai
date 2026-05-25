---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [packages/typescript/ai/src/types.ts:1737](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1737)

Result of audio transcription.

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1747](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1747)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1739](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1739)

Unique identifier for the transcription

***

### language?

```ts
optional language: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1745](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1745)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1741](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1741)

Model used for transcription

***

### segments?

```ts
optional segments: TranscriptionSegment[];
```

Defined in: [packages/typescript/ai/src/types.ts:1749](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1749)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1743](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1743)

The full transcribed text

***

### words?

```ts
optional words: TranscriptionWord[];
```

Defined in: [packages/typescript/ai/src/types.ts:1751](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1751)

Word-level timestamps, if available

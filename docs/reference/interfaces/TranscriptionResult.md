---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [packages/typescript/ai/src/types.ts:1701](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1701)

Result of audio transcription.

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1711](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1711)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1703](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1703)

Unique identifier for the transcription

***

### language?

```ts
optional language: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1709](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1709)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1705](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1705)

Model used for transcription

***

### segments?

```ts
optional segments: TranscriptionSegment[];
```

Defined in: [packages/typescript/ai/src/types.ts:1713](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1713)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1707](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1707)

The full transcribed text

***

### words?

```ts
optional words: TranscriptionWord[];
```

Defined in: [packages/typescript/ai/src/types.ts:1715](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1715)

Word-level timestamps, if available

---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [types.ts:1226](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1226)

Result of audio transcription.

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [types.ts:1236](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1236)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [types.ts:1228](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1228)

Unique identifier for the transcription

***

### language?

```ts
optional language: string;
```

Defined in: [types.ts:1234](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1234)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [types.ts:1230](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1230)

Model used for transcription

***

### segments?

```ts
optional segments: TranscriptionSegment[];
```

Defined in: [types.ts:1238](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1238)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [types.ts:1232](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1232)

The full transcribed text

***

### words?

```ts
optional words: TranscriptionWord[];
```

Defined in: [types.ts:1240](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1240)

Word-level timestamps, if available

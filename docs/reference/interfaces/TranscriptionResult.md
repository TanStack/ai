---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [types.ts:1209](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1209)

Result of audio transcription.

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [types.ts:1219](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1219)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [types.ts:1211](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1211)

Unique identifier for the transcription

***

### language?

```ts
optional language: string;
```

Defined in: [types.ts:1217](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1217)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [types.ts:1213](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1213)

Model used for transcription

***

### segments?

```ts
optional segments: TranscriptionSegment[];
```

Defined in: [types.ts:1221](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1221)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [types.ts:1215](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1215)

The full transcribed text

***

### words?

```ts
optional words: TranscriptionWord[];
```

Defined in: [types.ts:1223](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1223)

Word-level timestamps, if available

---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [types.ts:1147](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1147)

Result of audio transcription.

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [types.ts:1157](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1157)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [types.ts:1149](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1149)

Unique identifier for the transcription

***

### language?

```ts
optional language: string;
```

Defined in: [types.ts:1155](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1155)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [types.ts:1151](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1151)

Model used for transcription

***

### segments?

```ts
optional segments: TranscriptionSegment[];
```

Defined in: [types.ts:1159](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1159)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [types.ts:1153](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1153)

The full transcribed text

***

### words?

```ts
optional words: TranscriptionWord[];
```

Defined in: [types.ts:1161](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1161)

Word-level timestamps, if available

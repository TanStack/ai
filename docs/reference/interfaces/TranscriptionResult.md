---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [types.ts:1003](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1003)

Result of audio transcription.

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [types.ts:1013](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1013)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [types.ts:1005](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1005)

Unique identifier for the transcription

***

### language?

```ts
optional language: string;
```

Defined in: [types.ts:1011](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1011)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [types.ts:1007](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1007)

Model used for transcription

***

### segments?

```ts
optional segments: TranscriptionSegment[];
```

Defined in: [types.ts:1015](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1015)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [types.ts:1009](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1009)

The full transcribed text

***

### words?

```ts
optional words: TranscriptionWord[];
```

Defined in: [types.ts:1017](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1017)

Word-level timestamps, if available

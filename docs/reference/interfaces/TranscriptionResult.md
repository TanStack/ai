---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [types.ts:1181](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1181)

Result of audio transcription.

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [types.ts:1191](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1191)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [types.ts:1183](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1183)

Unique identifier for the transcription

***

### language?

```ts
optional language: string;
```

Defined in: [types.ts:1189](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1189)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [types.ts:1185](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1185)

Model used for transcription

***

### segments?

```ts
optional segments: TranscriptionSegment[];
```

Defined in: [types.ts:1193](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1193)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [types.ts:1187](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1187)

The full transcribed text

***

### words?

```ts
optional words: TranscriptionWord[];
```

Defined in: [types.ts:1195](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1195)

Word-level timestamps, if available

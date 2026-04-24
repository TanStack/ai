---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [packages/typescript/ai/src/types.ts:1436](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1436)

Result of audio transcription.

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1446](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1446)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1438](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1438)

Unique identifier for the transcription

***

### language?

```ts
optional language: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1444](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1444)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1440](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1440)

Model used for transcription

***

### segments?

```ts
optional segments: TranscriptionSegment[];
```

Defined in: [packages/typescript/ai/src/types.ts:1448](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1448)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1442](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1442)

The full transcribed text

***

### words?

```ts
optional words: TranscriptionWord[];
```

Defined in: [packages/typescript/ai/src/types.ts:1450](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1450)

Word-level timestamps, if available

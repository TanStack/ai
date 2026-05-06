---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [packages/typescript/ai/src/types.ts:1505](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1505)

Result of audio transcription.

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1515](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1515)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1507](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1507)

Unique identifier for the transcription

***

### language?

```ts
optional language: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1513](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1513)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1509](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1509)

Model used for transcription

***

### segments?

```ts
optional segments: TranscriptionSegment[];
```

Defined in: [packages/typescript/ai/src/types.ts:1517](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1517)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1511](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1511)

The full transcribed text

***

### words?

```ts
optional words: TranscriptionWord[];
```

Defined in: [packages/typescript/ai/src/types.ts:1519](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1519)

Word-level timestamps, if available

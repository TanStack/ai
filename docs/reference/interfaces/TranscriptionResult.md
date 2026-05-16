---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [packages/typescript/ai/src/types.ts:1653](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1653)

Result of audio transcription.

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1663](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1663)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1655](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1655)

Unique identifier for the transcription

***

### language?

```ts
optional language: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1661](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1661)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1657](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1657)

Model used for transcription

***

### segments?

```ts
optional segments: TranscriptionSegment[];
```

Defined in: [packages/typescript/ai/src/types.ts:1665](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1665)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1659](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1659)

The full transcribed text

***

### words?

```ts
optional words: TranscriptionWord[];
```

Defined in: [packages/typescript/ai/src/types.ts:1667](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1667)

Word-level timestamps, if available

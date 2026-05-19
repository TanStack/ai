---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [packages/typescript/ai/src/types.ts:1716](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1716)

Result of audio transcription.

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1726](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1726)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1718](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1718)

Unique identifier for the transcription

***

### language?

```ts
optional language: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1724](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1724)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1720](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1720)

Model used for transcription

***

### segments?

```ts
optional segments: TranscriptionSegment[];
```

Defined in: [packages/typescript/ai/src/types.ts:1728](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1728)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1722](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1722)

The full transcribed text

***

### words?

```ts
optional words: TranscriptionWord[];
```

Defined in: [packages/typescript/ai/src/types.ts:1730](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1730)

Word-level timestamps, if available

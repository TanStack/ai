---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [packages/typescript/ai/src/types.ts:1622](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1622)

Result of audio transcription.

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1632](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1632)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1624](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1624)

Unique identifier for the transcription

***

### language?

```ts
optional language: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1630](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1630)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1626](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1626)

Model used for transcription

***

### segments?

```ts
optional segments: TranscriptionSegment[];
```

Defined in: [packages/typescript/ai/src/types.ts:1634](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1634)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1628](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1628)

The full transcribed text

***

### words?

```ts
optional words: TranscriptionWord[];
```

Defined in: [packages/typescript/ai/src/types.ts:1636](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1636)

Word-level timestamps, if available

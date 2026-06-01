---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [packages/ai/src/types.ts:1823](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1823)

Result of audio transcription.

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [packages/ai/src/types.ts:1833](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1833)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1825](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1825)

Unique identifier for the transcription

***

### language?

```ts
optional language: string;
```

Defined in: [packages/ai/src/types.ts:1831](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1831)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1827](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1827)

Model used for transcription

***

### segments?

```ts
optional segments: TranscriptionSegment[];
```

Defined in: [packages/ai/src/types.ts:1835](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1835)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1829](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1829)

The full transcribed text

***

### words?

```ts
optional words: TranscriptionWord[];
```

Defined in: [packages/ai/src/types.ts:1837](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1837)

Word-level timestamps, if available

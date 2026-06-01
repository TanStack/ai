---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [packages/ai/src/types.ts:1803](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1803)

Result of audio transcription.

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [packages/ai/src/types.ts:1813](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1813)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1805](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1805)

Unique identifier for the transcription

***

### language?

```ts
optional language: string;
```

Defined in: [packages/ai/src/types.ts:1811](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1811)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1807](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1807)

Model used for transcription

***

### segments?

```ts
optional segments: TranscriptionSegment[];
```

Defined in: [packages/ai/src/types.ts:1815](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1815)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1809](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1809)

The full transcribed text

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1819](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1819)

Token usage information (if provided by the adapter)

***

### words?

```ts
optional words: TranscriptionWord[];
```

Defined in: [packages/ai/src/types.ts:1817](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1817)

Word-level timestamps, if available

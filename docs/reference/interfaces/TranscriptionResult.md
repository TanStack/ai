---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [packages/ai/src/types.ts:1768](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1768)

Result of audio transcription.

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [packages/ai/src/types.ts:1778](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1778)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1770](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1770)

Unique identifier for the transcription

***

### language?

```ts
optional language: string;
```

Defined in: [packages/ai/src/types.ts:1776](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1776)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1772](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1772)

Model used for transcription

***

### segments?

```ts
optional segments: TranscriptionSegment[];
```

Defined in: [packages/ai/src/types.ts:1780](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1780)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1774](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1774)

The full transcribed text

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1784](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1784)

Token usage information (if provided by the adapter)

***

### words?

```ts
optional words: TranscriptionWord[];
```

Defined in: [packages/ai/src/types.ts:1782](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1782)

Word-level timestamps, if available

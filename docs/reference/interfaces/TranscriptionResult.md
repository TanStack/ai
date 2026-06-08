---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [packages/ai/src/types.ts:1774](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1774)

Result of audio transcription.

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [packages/ai/src/types.ts:1784](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1784)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1776](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1776)

Unique identifier for the transcription

***

### language?

```ts
optional language: string;
```

Defined in: [packages/ai/src/types.ts:1782](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1782)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1778](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1778)

Model used for transcription

***

### segments?

```ts
optional segments: TranscriptionSegment[];
```

Defined in: [packages/ai/src/types.ts:1786](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1786)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1780](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1780)

The full transcribed text

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1790](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1790)

Token usage information (if provided by the adapter)

***

### words?

```ts
optional words: TranscriptionWord[];
```

Defined in: [packages/ai/src/types.ts:1788](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1788)

Word-level timestamps, if available

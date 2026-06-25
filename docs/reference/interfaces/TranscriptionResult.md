---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [packages/ai/src/types.ts:1894](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1894)

Result of audio transcription.

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [packages/ai/src/types.ts:1904](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1904)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1896](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1896)

Unique identifier for the transcription

***

### language?

```ts
optional language: string;
```

Defined in: [packages/ai/src/types.ts:1902](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1902)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1898](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1898)

Model used for transcription

***

### segments?

```ts
optional segments: TranscriptionSegment[];
```

Defined in: [packages/ai/src/types.ts:1906](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1906)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1900](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1900)

The full transcribed text

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1910](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1910)

Token usage information (if provided by the adapter)

***

### words?

```ts
optional words: TranscriptionWord[];
```

Defined in: [packages/ai/src/types.ts:1908](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1908)

Word-level timestamps, if available

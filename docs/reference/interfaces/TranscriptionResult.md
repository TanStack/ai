---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [packages/ai/src/types.ts:1916](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1916)

Result of audio transcription.

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [packages/ai/src/types.ts:1926](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1926)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1918](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1918)

Unique identifier for the transcription

***

### language?

```ts
optional language: string;
```

Defined in: [packages/ai/src/types.ts:1924](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1924)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1920](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1920)

Model used for transcription

***

### segments?

```ts
optional segments: TranscriptionSegment[];
```

Defined in: [packages/ai/src/types.ts:1928](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1928)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1922](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1922)

The full transcribed text

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1932](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1932)

Token usage information (if provided by the adapter)

***

### words?

```ts
optional words: TranscriptionWord[];
```

Defined in: [packages/ai/src/types.ts:1930](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1930)

Word-level timestamps, if available

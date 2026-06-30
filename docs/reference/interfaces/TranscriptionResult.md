---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [packages/ai/src/types.ts:1947](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1947)

Result of audio transcription.

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [packages/ai/src/types.ts:1957](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1957)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1949](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1949)

Unique identifier for the transcription

***

### language?

```ts
optional language: string;
```

Defined in: [packages/ai/src/types.ts:1955](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1955)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1951](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1951)

Model used for transcription

***

### segments?

```ts
optional segments: TranscriptionSegment[];
```

Defined in: [packages/ai/src/types.ts:1959](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1959)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1953](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1953)

The full transcribed text

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1963](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1963)

Token usage information (if provided by the adapter)

***

### words?

```ts
optional words: TranscriptionWord[];
```

Defined in: [packages/ai/src/types.ts:1961](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1961)

Word-level timestamps, if available

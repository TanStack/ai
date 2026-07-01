---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [packages/ai/src/types.ts:1967](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1967)

Result of audio transcription.

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [packages/ai/src/types.ts:1977](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1977)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1969](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1969)

Unique identifier for the transcription

***

### language?

```ts
optional language: string;
```

Defined in: [packages/ai/src/types.ts:1975](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1975)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1971](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1971)

Model used for transcription

***

### segments?

```ts
optional segments: TranscriptionSegment[];
```

Defined in: [packages/ai/src/types.ts:1979](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1979)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1973](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1973)

The full transcribed text

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1983](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1983)

Token usage information (if provided by the adapter)

***

### words?

```ts
optional words: TranscriptionWord[];
```

Defined in: [packages/ai/src/types.ts:1981](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1981)

Word-level timestamps, if available

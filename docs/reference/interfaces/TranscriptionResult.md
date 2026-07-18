---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [packages/ai/src/types.ts:2104](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2104)

Result of audio transcription.

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [packages/ai/src/types.ts:2114](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2114)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2106](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2106)

Unique identifier for the transcription

***

### language?

```ts
optional language: string;
```

Defined in: [packages/ai/src/types.ts:2112](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2112)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2108](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2108)

Model used for transcription

***

### segments?

```ts
optional segments: TranscriptionSegment[];
```

Defined in: [packages/ai/src/types.ts:2116](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2116)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2110](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2110)

The full transcribed text

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2120](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2120)

Token usage information (if provided by the adapter)

***

### words?

```ts
optional words: TranscriptionWord[];
```

Defined in: [packages/ai/src/types.ts:2118](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2118)

Word-level timestamps, if available

---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [packages/ai/src/types.ts:2095](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2095)

Result of audio transcription.

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [packages/ai/src/types.ts:2105](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2105)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2097](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2097)

Unique identifier for the transcription

***

### language?

```ts
optional language: string;
```

Defined in: [packages/ai/src/types.ts:2103](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2103)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2099](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2099)

Model used for transcription

***

### segments?

```ts
optional segments: TranscriptionSegment[];
```

Defined in: [packages/ai/src/types.ts:2107](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2107)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2101](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2101)

The full transcribed text

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2111](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2111)

Token usage information (if provided by the adapter)

***

### words?

```ts
optional words: TranscriptionWord[];
```

Defined in: [packages/ai/src/types.ts:2109](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2109)

Word-level timestamps, if available

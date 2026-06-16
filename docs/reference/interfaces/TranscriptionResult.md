---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [packages/ai/src/types.ts:1781](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1781)

Result of audio transcription.

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [packages/ai/src/types.ts:1791](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1791)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1783](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1783)

Unique identifier for the transcription

***

### language?

```ts
optional language: string;
```

Defined in: [packages/ai/src/types.ts:1789](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1789)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1785](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1785)

Model used for transcription

***

### segments?

```ts
optional segments: TranscriptionSegment[];
```

Defined in: [packages/ai/src/types.ts:1793](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1793)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1787](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1787)

The full transcribed text

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1797](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1797)

Token usage information (if provided by the adapter)

***

### words?

```ts
optional words: TranscriptionWord[];
```

Defined in: [packages/ai/src/types.ts:1795](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1795)

Word-level timestamps, if available

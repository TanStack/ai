---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [packages/ai/src/types.ts:2136](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2136)

Result of audio transcription.

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [packages/ai/src/types.ts:2146](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2146)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2138](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2138)

Unique identifier for the transcription

***

### language?

```ts
optional language: string;
```

Defined in: [packages/ai/src/types.ts:2144](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2144)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2140](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2140)

Model used for transcription

***

### segments?

```ts
optional segments: TranscriptionSegment[];
```

Defined in: [packages/ai/src/types.ts:2148](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2148)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2142](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2142)

The full transcribed text

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2152](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2152)

Token usage information (if provided by the adapter)

***

### words?

```ts
optional words: TranscriptionWord[];
```

Defined in: [packages/ai/src/types.ts:2150](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2150)

Word-level timestamps, if available

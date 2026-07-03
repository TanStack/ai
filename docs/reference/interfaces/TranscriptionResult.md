---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [packages/ai/src/types.ts:1989](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1989)

Result of audio transcription.

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [packages/ai/src/types.ts:1999](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1999)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1991](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1991)

Unique identifier for the transcription

***

### language?

```ts
optional language: string;
```

Defined in: [packages/ai/src/types.ts:1997](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1997)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1993](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1993)

Model used for transcription

***

### segments?

```ts
optional segments: TranscriptionSegment[];
```

Defined in: [packages/ai/src/types.ts:2001](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2001)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1995](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1995)

The full transcribed text

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2005](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2005)

Token usage information (if provided by the adapter)

***

### words?

```ts
optional words: TranscriptionWord[];
```

Defined in: [packages/ai/src/types.ts:2003](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2003)

Word-level timestamps, if available

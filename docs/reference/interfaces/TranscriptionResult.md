---
id: TranscriptionResult
title: TranscriptionResult
---

Defined in: [packages/ai/src/types.ts:2872](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2872)

Result of audio transcription.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2890](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2890)

Persisted artifact references for generated assets, when available

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:2882](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2882)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2874](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2874)

Unique identifier for the transcription

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:2880](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2880)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2876](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2876)

Model used for transcription

***

### segments?

```ts
optional segments?: TranscriptionSegment[];
```

Defined in: [packages/ai/src/types.ts:2884](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2884)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2878](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2878)

The full transcribed text

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2888](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2888)

Token usage information (if provided by the adapter)

***

### words?

```ts
optional words?: TranscriptionWord[];
```

Defined in: [packages/ai/src/types.ts:2886](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2886)

Word-level timestamps, if available

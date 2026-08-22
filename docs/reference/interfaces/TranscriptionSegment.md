---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [packages/ai/src/types.ts:2307](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2307)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence?: number;
```

Defined in: [packages/ai/src/types.ts:2317](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2317)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/ai/src/types.ts:2313](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2313)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/ai/src/types.ts:2309](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2309)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker?: string;
```

Defined in: [packages/ai/src/types.ts:2319](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2319)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/ai/src/types.ts:2311](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2311)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2315](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2315)

Transcribed text for this segment

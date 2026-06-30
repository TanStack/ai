---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [packages/ai/src/types.ts:1917](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1917)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence: number;
```

Defined in: [packages/ai/src/types.ts:1927](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1927)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/ai/src/types.ts:1923](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1923)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/ai/src/types.ts:1919](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1919)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker: string;
```

Defined in: [packages/ai/src/types.ts:1929](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1929)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/ai/src/types.ts:1921](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1921)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1925](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1925)

Transcribed text for this segment

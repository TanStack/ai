---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [packages/ai/src/types.ts:2106](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2106)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence: number;
```

Defined in: [packages/ai/src/types.ts:2116](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2116)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/ai/src/types.ts:2112](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2112)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/ai/src/types.ts:2108](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2108)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker: string;
```

Defined in: [packages/ai/src/types.ts:2118](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2118)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/ai/src/types.ts:2110](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2110)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2114](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2114)

Transcribed text for this segment

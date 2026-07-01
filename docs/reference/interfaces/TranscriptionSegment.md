---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [packages/ai/src/types.ts:1937](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1937)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence: number;
```

Defined in: [packages/ai/src/types.ts:1947](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1947)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/ai/src/types.ts:1943](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1943)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/ai/src/types.ts:1939](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1939)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker: string;
```

Defined in: [packages/ai/src/types.ts:1949](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1949)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/ai/src/types.ts:1941](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1941)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1945](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1945)

Transcribed text for this segment

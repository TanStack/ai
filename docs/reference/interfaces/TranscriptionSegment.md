---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [packages/ai/src/types.ts:1959](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1959)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence: number;
```

Defined in: [packages/ai/src/types.ts:1969](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1969)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/ai/src/types.ts:1965](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1965)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/ai/src/types.ts:1961](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1961)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker: string;
```

Defined in: [packages/ai/src/types.ts:1971](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1971)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/ai/src/types.ts:1963](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1963)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1967](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1967)

Transcribed text for this segment

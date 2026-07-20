---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [packages/ai/src/types.ts:2074](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2074)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence: number;
```

Defined in: [packages/ai/src/types.ts:2084](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2084)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/ai/src/types.ts:2080](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2080)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/ai/src/types.ts:2076](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2076)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker: string;
```

Defined in: [packages/ai/src/types.ts:2086](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2086)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/ai/src/types.ts:2078](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2078)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2082](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2082)

Transcribed text for this segment

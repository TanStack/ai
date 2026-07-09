---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [packages/ai/src/types.ts:2121](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2121)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence: number;
```

Defined in: [packages/ai/src/types.ts:2131](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2131)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/ai/src/types.ts:2127](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2127)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/ai/src/types.ts:2123](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2123)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker: string;
```

Defined in: [packages/ai/src/types.ts:2133](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2133)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/ai/src/types.ts:2125](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2125)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2129](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2129)

Transcribed text for this segment

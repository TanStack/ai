---
id: TranscriptionSegment
title: TranscriptionSegment
---

Defined in: [packages/ai/src/types.ts:2976](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2976)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence?: number;
```

Defined in: [packages/ai/src/types.ts:2986](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2986)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/ai/src/types.ts:2982](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2982)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/ai/src/types.ts:2978](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2978)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker?: string;
```

Defined in: [packages/ai/src/types.ts:2988](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2988)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/ai/src/types.ts:2980](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2980)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2984](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2984)

Transcribed text for this segment

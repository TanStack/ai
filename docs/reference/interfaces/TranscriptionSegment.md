---
id: TranscriptionSegment
title: TranscriptionSegment
---

Defined in: [packages/ai/src/types.ts:3255](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3255)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence?: number;
```

Defined in: [packages/ai/src/types.ts:3265](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3265)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/ai/src/types.ts:3261](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3261)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/ai/src/types.ts:3257](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3257)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker?: string;
```

Defined in: [packages/ai/src/types.ts:3267](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3267)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/ai/src/types.ts:3259](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3259)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:3263](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3263)

Transcribed text for this segment

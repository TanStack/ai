---
id: TranscriptionSegment
title: TranscriptionSegment
---

Defined in: [packages/ai/src/types.ts:2779](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2779)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence?: number;
```

Defined in: [packages/ai/src/types.ts:2789](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2789)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/ai/src/types.ts:2785](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2785)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/ai/src/types.ts:2781](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2781)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker?: string;
```

Defined in: [packages/ai/src/types.ts:2791](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2791)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/ai/src/types.ts:2783](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2783)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2787](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2787)

Transcribed text for this segment

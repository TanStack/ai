---
id: TranscriptionSegment
title: TranscriptionSegment
---

Defined in: [packages/ai/src/types.ts:2997](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2997)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence?: number;
```

Defined in: [packages/ai/src/types.ts:3007](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3007)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/ai/src/types.ts:3003](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3003)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/ai/src/types.ts:2999](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2999)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker?: string;
```

Defined in: [packages/ai/src/types.ts:3009](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3009)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/ai/src/types.ts:3001](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3001)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:3005](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3005)

Transcribed text for this segment

---
id: TranscriptionSegment
title: TranscriptionSegment
---

Defined in: [packages/ai/src/types.ts:2697](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2697)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence?: number;
```

Defined in: [packages/ai/src/types.ts:2707](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2707)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/ai/src/types.ts:2703](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2703)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/ai/src/types.ts:2699](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2699)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker?: string;
```

Defined in: [packages/ai/src/types.ts:2709](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2709)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/ai/src/types.ts:2701](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2701)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2705](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2705)

Transcribed text for this segment

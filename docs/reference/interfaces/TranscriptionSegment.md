---
id: TranscriptionSegment
title: TranscriptionSegment
---

Defined in: [packages/ai/src/types.ts:2719](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2719)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence?: number;
```

Defined in: [packages/ai/src/types.ts:2729](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2729)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/ai/src/types.ts:2725](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2725)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/ai/src/types.ts:2721](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2721)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker?: string;
```

Defined in: [packages/ai/src/types.ts:2731](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2731)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/ai/src/types.ts:2723](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2723)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2727](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2727)

Transcribed text for this segment

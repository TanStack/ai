---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [types.ts:973](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L973)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence: number;
```

Defined in: [types.ts:983](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L983)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [types.ts:979](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L979)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [types.ts:975](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L975)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker: string;
```

Defined in: [types.ts:985](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L985)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [types.ts:977](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L977)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [types.ts:981](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L981)

Transcribed text for this segment

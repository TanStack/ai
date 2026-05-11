---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [packages/typescript/ai/src/types.ts:1488](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1488)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1498](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1498)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1494](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1494)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1490](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1490)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1500](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1500)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1492](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1492)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1496](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1496)

Transcribed text for this segment

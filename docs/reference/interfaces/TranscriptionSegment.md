---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [packages/typescript/ai/src/types.ts:1480](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1480)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1490](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1490)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1486](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1486)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1482](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1482)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1492](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1492)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1484](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1484)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1488](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1488)

Transcribed text for this segment

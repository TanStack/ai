---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [packages/typescript/ai/src/types.ts:1686](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1686)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1696](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1696)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1692](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1692)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1688](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1688)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1698](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1698)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1690](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1690)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1694](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1694)

Transcribed text for this segment

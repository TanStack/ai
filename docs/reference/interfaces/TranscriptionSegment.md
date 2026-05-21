---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [packages/typescript/ai/src/types.ts:1690](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1690)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1700](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1700)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1696](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1696)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1692](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1692)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1702](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1702)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1694](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1694)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1698](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1698)

Transcribed text for this segment

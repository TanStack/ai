---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [packages/typescript/ai/src/types.ts:1623](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1623)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1633](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1633)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1629](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1629)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1625](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1625)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1635](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1635)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1627](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1627)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1631](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1631)

Transcribed text for this segment

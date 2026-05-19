---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [packages/typescript/ai/src/types.ts:1671](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1671)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1681](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1681)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1677](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1677)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1673](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1673)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1683](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1683)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1675](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1675)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1679](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1679)

Transcribed text for this segment

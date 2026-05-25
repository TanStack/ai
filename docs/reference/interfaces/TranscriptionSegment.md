---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [packages/typescript/ai/src/types.ts:1691](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1691)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1701](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1701)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1697](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1697)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1693](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1693)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1703](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1703)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1695](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1695)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1699](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1699)

Transcribed text for this segment

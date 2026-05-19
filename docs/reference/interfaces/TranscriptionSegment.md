---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [packages/typescript/ai/src/types.ts:1681](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1681)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1691](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1691)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1687](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1687)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1683](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1683)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1693](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1693)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1685](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1685)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1689](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1689)

Transcribed text for this segment

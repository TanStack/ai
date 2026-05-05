---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [packages/typescript/ai/src/types.ts:1475](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1475)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1485](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1485)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1481](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1481)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1477](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1477)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1487](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1487)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1479](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1479)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1483](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1483)

Transcribed text for this segment

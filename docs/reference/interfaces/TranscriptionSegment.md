---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [packages/typescript/ai/src/types.ts:1406](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1406)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1416](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1416)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1412](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1412)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1408](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1408)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1418](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1418)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1410](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1410)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1414](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1414)

Transcribed text for this segment

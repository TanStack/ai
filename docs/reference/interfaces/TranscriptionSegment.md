---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [packages/typescript/ai/src/types.ts:1592](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1592)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1602](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1602)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1598](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1598)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1594](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1594)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1604](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1604)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1596](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1596)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1600](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1600)

Transcribed text for this segment

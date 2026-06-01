---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [packages/ai/src/types.ts:1773](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1773)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence: number;
```

Defined in: [packages/ai/src/types.ts:1783](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1783)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/ai/src/types.ts:1779](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1779)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/ai/src/types.ts:1775](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1775)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker: string;
```

Defined in: [packages/ai/src/types.ts:1785](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1785)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/ai/src/types.ts:1777](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1777)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1781](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1781)

Transcribed text for this segment

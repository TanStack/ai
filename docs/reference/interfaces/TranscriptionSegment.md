---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [types.ts:968](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L968)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence: number;
```

Defined in: [types.ts:978](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L978)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [types.ts:974](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L974)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [types.ts:970](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L970)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker: string;
```

Defined in: [types.ts:980](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L980)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [types.ts:972](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L972)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [types.ts:976](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L976)

Transcribed text for this segment

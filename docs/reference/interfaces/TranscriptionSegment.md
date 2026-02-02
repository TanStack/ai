---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [types.ts:1117](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1117)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence: number;
```

Defined in: [types.ts:1127](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1127)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [types.ts:1123](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1123)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [types.ts:1119](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1119)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker: string;
```

Defined in: [types.ts:1129](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1129)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [types.ts:1121](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1121)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [types.ts:1125](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1125)

Transcribed text for this segment

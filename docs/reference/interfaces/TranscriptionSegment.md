---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [types.ts:1196](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1196)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence: number;
```

Defined in: [types.ts:1206](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1206)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [types.ts:1202](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1202)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [types.ts:1198](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1198)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker: string;
```

Defined in: [types.ts:1208](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1208)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [types.ts:1200](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1200)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [types.ts:1204](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1204)

Transcribed text for this segment

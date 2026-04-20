---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [packages/typescript/ai/src/types.ts:1370](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1370)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1380](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1380)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1376](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1376)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1372](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1372)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1382](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1382)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1374](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1374)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1378](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1378)

Transcribed text for this segment

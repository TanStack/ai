---
id: TranscriptionSegment
title: TranscriptionSegment
---

Defined in: [packages/ai/src/types.ts:3220](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3220)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence?: number;
```

Defined in: [packages/ai/src/types.ts:3230](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3230)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/ai/src/types.ts:3226](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3226)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/ai/src/types.ts:3222](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3222)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker?: string;
```

Defined in: [packages/ai/src/types.ts:3232](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3232)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/ai/src/types.ts:3224](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3224)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:3228](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3228)

Transcribed text for this segment

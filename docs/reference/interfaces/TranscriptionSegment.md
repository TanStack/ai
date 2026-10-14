---
id: TranscriptionSegment
title: TranscriptionSegment
---

Defined in: [packages/ai/src/types.ts:3213](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3213)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence?: number;
```

Defined in: [packages/ai/src/types.ts:3223](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3223)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/ai/src/types.ts:3219](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3219)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/ai/src/types.ts:3215](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3215)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker?: string;
```

Defined in: [packages/ai/src/types.ts:3225](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3225)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/ai/src/types.ts:3217](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3217)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:3221](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3221)

Transcribed text for this segment

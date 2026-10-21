---
id: TranscriptionSegment
title: TranscriptionSegment
---

Defined in: packages/ai/src/types.ts:3171

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence?: number;
```

Defined in: packages/ai/src/types.ts:3181

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: packages/ai/src/types.ts:3177

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: packages/ai/src/types.ts:3173

Unique identifier for the segment

***

### speaker?

```ts
optional speaker?: string;
```

Defined in: packages/ai/src/types.ts:3183

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: packages/ai/src/types.ts:3175

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: packages/ai/src/types.ts:3179

Transcribed text for this segment

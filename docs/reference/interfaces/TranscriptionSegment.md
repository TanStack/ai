---
id: TranscriptionSegment
title: TranscriptionSegment
---

Defined in: packages/ai/src/types.ts:3172

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence?: number;
```

Defined in: packages/ai/src/types.ts:3182

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: packages/ai/src/types.ts:3178

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: packages/ai/src/types.ts:3174

Unique identifier for the segment

***

### speaker?

```ts
optional speaker?: string;
```

Defined in: packages/ai/src/types.ts:3184

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: packages/ai/src/types.ts:3176

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: packages/ai/src/types.ts:3180

Transcribed text for this segment

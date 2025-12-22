---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [types.ts:952](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L952)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence: number;
```

Defined in: [types.ts:962](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L962)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [types.ts:958](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L958)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [types.ts:954](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L954)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker: string;
```

Defined in: [types.ts:964](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L964)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [types.ts:956](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L956)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [types.ts:960](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L960)

Transcribed text for this segment

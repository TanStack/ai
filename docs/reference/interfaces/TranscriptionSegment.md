---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [packages/ai/src/types.ts:1864](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1864)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence: number;
```

Defined in: [packages/ai/src/types.ts:1874](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1874)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/ai/src/types.ts:1870](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1870)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/ai/src/types.ts:1866](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1866)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker: string;
```

Defined in: [packages/ai/src/types.ts:1876](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1876)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/ai/src/types.ts:1868](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1868)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1872](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1872)

Transcribed text for this segment

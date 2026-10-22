---
id: TTSSegment
title: TTSSegment
---

Defined in: packages/ai/src/types.ts:2865

A stretch of audio attributable to one turn (multi-voice) or one utterance
(single voice). This is what tells a consumer which turn is where.

## Properties

### endSeconds

```ts
endSeconds: number;
```

Defined in: packages/ai/src/types.ts:2869

End of the segment in seconds.

***

### startSeconds

```ts
startSeconds: number;
```

Defined in: packages/ai/src/types.ts:2867

Start of the segment in seconds.

***

### text?

```ts
optional text?: string;
```

Defined in: packages/ai/src/types.ts:2875

Text spoken in this segment, when the provider reports it.

***

### turnIndex?

```ts
optional turnIndex?: number;
```

Defined in: packages/ai/src/types.ts:2871

Index into the request's `turns`, when the provider reports it.

***

### voice?

```ts
optional voice?: string;
```

Defined in: packages/ai/src/types.ts:2873

Voice heard in this segment, when the provider reports it.

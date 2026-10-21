---
id: TTSSegment
title: TTSSegment
---

Defined in: packages/ai/src/types.ts:2864

A stretch of audio attributable to one turn (multi-voice) or one utterance
(single voice). This is what tells a consumer which turn is where.

## Properties

### endSeconds

```ts
endSeconds: number;
```

Defined in: packages/ai/src/types.ts:2868

End of the segment in seconds.

***

### startSeconds

```ts
startSeconds: number;
```

Defined in: packages/ai/src/types.ts:2866

Start of the segment in seconds.

***

### text?

```ts
optional text?: string;
```

Defined in: packages/ai/src/types.ts:2874

Text spoken in this segment, when the provider reports it.

***

### turnIndex?

```ts
optional turnIndex?: number;
```

Defined in: packages/ai/src/types.ts:2870

Index into the request's `turns`, when the provider reports it.

***

### voice?

```ts
optional voice?: string;
```

Defined in: packages/ai/src/types.ts:2872

Voice heard in this segment, when the provider reports it.

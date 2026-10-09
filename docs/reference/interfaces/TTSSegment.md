---
id: TTSSegment
title: TTSSegment
---

Defined in: [packages/ai/src/types.ts:2690](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2690)

A stretch of audio attributable to one turn (multi-voice) or one utterance
(single voice). This is what tells a consumer which turn is where.

## Properties

### endSeconds

```ts
endSeconds: number;
```

Defined in: [packages/ai/src/types.ts:2694](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2694)

End of the segment in seconds.

***

### startSeconds

```ts
startSeconds: number;
```

Defined in: [packages/ai/src/types.ts:2692](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2692)

Start of the segment in seconds.

***

### text?

```ts
optional text?: string;
```

Defined in: [packages/ai/src/types.ts:2700](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2700)

Text spoken in this segment, when the provider reports it.

***

### turnIndex?

```ts
optional turnIndex?: number;
```

Defined in: [packages/ai/src/types.ts:2696](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2696)

Index into the request's `turns`, when the provider reports it.

***

### voice?

```ts
optional voice?: string;
```

Defined in: [packages/ai/src/types.ts:2698](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2698)

Voice heard in this segment, when the provider reports it.

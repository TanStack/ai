---
id: TTSSegment
title: TTSSegment
---

Defined in: [packages/ai/src/types.ts:2535](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2535)

A stretch of audio attributable to one turn (multi-voice) or one utterance
(single voice). This is what tells a consumer which turn is where.

## Properties

### endSeconds

```ts
endSeconds: number;
```

Defined in: [packages/ai/src/types.ts:2539](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2539)

End of the segment in seconds.

***

### startSeconds

```ts
startSeconds: number;
```

Defined in: [packages/ai/src/types.ts:2537](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2537)

Start of the segment in seconds.

***

### text?

```ts
optional text?: string;
```

Defined in: [packages/ai/src/types.ts:2545](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2545)

Text spoken in this segment, when the provider reports it.

***

### turnIndex?

```ts
optional turnIndex?: number;
```

Defined in: [packages/ai/src/types.ts:2541](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2541)

Index into the request's `turns`, when the provider reports it.

***

### voice?

```ts
optional voice?: string;
```

Defined in: [packages/ai/src/types.ts:2543](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2543)

Voice heard in this segment, when the provider reports it.

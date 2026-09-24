---
id: TTSSegment
title: TTSSegment
---

Defined in: [packages/ai/src/types.ts:2472](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2472)

A stretch of audio attributable to one turn (multi-voice) or one utterance
(single voice). This is what tells a consumer which turn is where.

## Properties

### endSeconds

```ts
endSeconds: number;
```

Defined in: [packages/ai/src/types.ts:2476](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2476)

End of the segment in seconds.

***

### startSeconds

```ts
startSeconds: number;
```

Defined in: [packages/ai/src/types.ts:2474](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2474)

Start of the segment in seconds.

***

### text?

```ts
optional text?: string;
```

Defined in: [packages/ai/src/types.ts:2482](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2482)

Text spoken in this segment, when the provider reports it.

***

### turnIndex?

```ts
optional turnIndex?: number;
```

Defined in: [packages/ai/src/types.ts:2478](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2478)

Index into the request's `turns`, when the provider reports it.

***

### voice?

```ts
optional voice?: string;
```

Defined in: [packages/ai/src/types.ts:2480](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2480)

Voice heard in this segment, when the provider reports it.

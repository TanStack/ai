---
id: TTSSegment
title: TTSSegment
---

Defined in: [packages/ai/src/types.ts:2390](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2390)

A stretch of audio attributable to one turn (multi-voice) or one utterance
(single voice). This is what tells a consumer which turn is where.

## Properties

### endSeconds

```ts
endSeconds: number;
```

Defined in: [packages/ai/src/types.ts:2394](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2394)

End of the segment in seconds.

***

### startSeconds

```ts
startSeconds: number;
```

Defined in: [packages/ai/src/types.ts:2392](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2392)

Start of the segment in seconds.

***

### text?

```ts
optional text?: string;
```

Defined in: [packages/ai/src/types.ts:2400](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2400)

Text spoken in this segment, when the provider reports it.

***

### turnIndex?

```ts
optional turnIndex?: number;
```

Defined in: [packages/ai/src/types.ts:2396](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2396)

Index into the request's `turns`, when the provider reports it.

***

### voice?

```ts
optional voice?: string;
```

Defined in: [packages/ai/src/types.ts:2398](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2398)

Voice heard in this segment, when the provider reports it.

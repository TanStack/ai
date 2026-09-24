---
id: TTSSegment
title: TTSSegment
---

Defined in: [packages/ai/src/types.ts:2412](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2412)

A stretch of audio attributable to one turn (multi-voice) or one utterance
(single voice). This is what tells a consumer which turn is where.

## Properties

### endSeconds

```ts
endSeconds: number;
```

Defined in: [packages/ai/src/types.ts:2416](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2416)

End of the segment in seconds.

***

### startSeconds

```ts
startSeconds: number;
```

Defined in: [packages/ai/src/types.ts:2414](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2414)

Start of the segment in seconds.

***

### text?

```ts
optional text?: string;
```

Defined in: [packages/ai/src/types.ts:2422](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2422)

Text spoken in this segment, when the provider reports it.

***

### turnIndex?

```ts
optional turnIndex?: number;
```

Defined in: [packages/ai/src/types.ts:2418](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2418)

Index into the request's `turns`, when the provider reports it.

***

### voice?

```ts
optional voice?: string;
```

Defined in: [packages/ai/src/types.ts:2420](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2420)

Voice heard in this segment, when the provider reports it.

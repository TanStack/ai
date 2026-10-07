---
id: TTSSegment
title: TTSSegment
---

Defined in: [packages/ai/src/types.ts:2669](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2669)

A stretch of audio attributable to one turn (multi-voice) or one utterance
(single voice). This is what tells a consumer which turn is where.

## Properties

### endSeconds

```ts
endSeconds: number;
```

Defined in: [packages/ai/src/types.ts:2673](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2673)

End of the segment in seconds.

***

### startSeconds

```ts
startSeconds: number;
```

Defined in: [packages/ai/src/types.ts:2671](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2671)

Start of the segment in seconds.

***

### text?

```ts
optional text?: string;
```

Defined in: [packages/ai/src/types.ts:2679](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2679)

Text spoken in this segment, when the provider reports it.

***

### turnIndex?

```ts
optional turnIndex?: number;
```

Defined in: [packages/ai/src/types.ts:2675](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2675)

Index into the request's `turns`, when the provider reports it.

***

### voice?

```ts
optional voice?: string;
```

Defined in: [packages/ai/src/types.ts:2677](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2677)

Voice heard in this segment, when the provider reports it.

---
id: TTSSegment
title: TTSSegment
---

Defined in: [packages/ai/src/types.ts:2948](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2948)

A stretch of audio attributable to one turn (multi-voice) or one utterance
(single voice). This is what tells a consumer which turn is where.

## Properties

### endSeconds

```ts
endSeconds: number;
```

Defined in: [packages/ai/src/types.ts:2952](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2952)

End of the segment in seconds.

***

### startSeconds

```ts
startSeconds: number;
```

Defined in: [packages/ai/src/types.ts:2950](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2950)

Start of the segment in seconds.

***

### text?

```ts
optional text?: string;
```

Defined in: [packages/ai/src/types.ts:2958](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2958)

Text spoken in this segment, when the provider reports it.

***

### turnIndex?

```ts
optional turnIndex?: number;
```

Defined in: [packages/ai/src/types.ts:2954](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2954)

Index into the request's `turns`, when the provider reports it.

***

### voice?

```ts
optional voice?: string;
```

Defined in: [packages/ai/src/types.ts:2956](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2956)

Voice heard in this segment, when the provider reports it.

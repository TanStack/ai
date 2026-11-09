---
id: TTSSegment
title: TTSSegment
---

Defined in: [packages/ai/src/types.ts:2931](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2931)

A stretch of audio attributable to one turn (multi-voice) or one utterance
(single voice). This is what tells a consumer which turn is where.

## Properties

### endSeconds

```ts
endSeconds: number;
```

Defined in: [packages/ai/src/types.ts:2935](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2935)

End of the segment in seconds.

***

### startSeconds

```ts
startSeconds: number;
```

Defined in: [packages/ai/src/types.ts:2933](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2933)

Start of the segment in seconds.

***

### text?

```ts
optional text?: string;
```

Defined in: [packages/ai/src/types.ts:2941](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2941)

Text spoken in this segment, when the provider reports it.

***

### turnIndex?

```ts
optional turnIndex?: number;
```

Defined in: [packages/ai/src/types.ts:2937](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2937)

Index into the request's `turns`, when the provider reports it.

***

### voice?

```ts
optional voice?: string;
```

Defined in: [packages/ai/src/types.ts:2939](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2939)

Voice heard in this segment, when the provider reports it.

---
id: TTSAlignment
title: TTSAlignment
---

Defined in: [packages/ai/src/types.ts:2375](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2375)

Timings for the generated audio, returned when `timestamps: true` was
requested and the adapter declares `capabilities.timestamps`.

Granularity differs per provider — ElevenLabs reports characters, BytePlus
reports words — so `unit` says which, and the three arrays are parallel.
All times are **seconds**; adapters convert.

## Properties

### endSeconds

```ts
endSeconds: number[];
```

Defined in: [packages/ai/src/types.ts:2383](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2383)

End of each entry in seconds. Same length as `texts`.

***

### startSeconds

```ts
startSeconds: number[];
```

Defined in: [packages/ai/src/types.ts:2381](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2381)

Start of each entry in seconds. Same length as `texts`.

***

### texts

```ts
texts: string[];
```

Defined in: [packages/ai/src/types.ts:2379](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2379)

Entry text, in audio order.

***

### unit

```ts
unit: "character" | "word";
```

Defined in: [packages/ai/src/types.ts:2377](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2377)

Granularity of each entry.

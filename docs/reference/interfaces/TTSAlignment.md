---
id: TTSAlignment
title: TTSAlignment
---

Defined in: [packages/ai/src/types.ts:2654](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2654)

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

Defined in: [packages/ai/src/types.ts:2662](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2662)

End of each entry in seconds. Same length as `texts`.

***

### startSeconds

```ts
startSeconds: number[];
```

Defined in: [packages/ai/src/types.ts:2660](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2660)

Start of each entry in seconds. Same length as `texts`.

***

### texts

```ts
texts: string[];
```

Defined in: [packages/ai/src/types.ts:2658](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2658)

Entry text, in audio order.

***

### unit

```ts
unit: "character" | "word";
```

Defined in: [packages/ai/src/types.ts:2656](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2656)

Granularity of each entry.

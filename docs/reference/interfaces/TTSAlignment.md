---
id: TTSAlignment
title: TTSAlignment
---

Defined in: [packages/ai/src/types.ts:2675](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2675)

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

Defined in: [packages/ai/src/types.ts:2683](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2683)

End of each entry in seconds. Same length as `texts`.

***

### startSeconds

```ts
startSeconds: number[];
```

Defined in: [packages/ai/src/types.ts:2681](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2681)

Start of each entry in seconds. Same length as `texts`.

***

### texts

```ts
texts: string[];
```

Defined in: [packages/ai/src/types.ts:2679](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2679)

Entry text, in audio order.

***

### unit

```ts
unit: "character" | "word";
```

Defined in: [packages/ai/src/types.ts:2677](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2677)

Granularity of each entry.

---
id: TTSAlignment
title: TTSAlignment
---

Defined in: [packages/ai/src/types.ts:2933](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2933)

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

Defined in: [packages/ai/src/types.ts:2941](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2941)

End of each entry in seconds. Same length as `texts`.

***

### startSeconds

```ts
startSeconds: number[];
```

Defined in: [packages/ai/src/types.ts:2939](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2939)

Start of each entry in seconds. Same length as `texts`.

***

### texts

```ts
texts: string[];
```

Defined in: [packages/ai/src/types.ts:2937](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2937)

Entry text, in audio order.

***

### unit

```ts
unit: "character" | "word";
```

Defined in: [packages/ai/src/types.ts:2935](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2935)

Granularity of each entry.

---
id: TTSAlignment
title: TTSAlignment
---

Defined in: [packages/ai/src/types.ts:2397](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2397)

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

Defined in: [packages/ai/src/types.ts:2405](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2405)

End of each entry in seconds. Same length as `texts`.

***

### startSeconds

```ts
startSeconds: number[];
```

Defined in: [packages/ai/src/types.ts:2403](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2403)

Start of each entry in seconds. Same length as `texts`.

***

### texts

```ts
texts: string[];
```

Defined in: [packages/ai/src/types.ts:2401](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2401)

Entry text, in audio order.

***

### unit

```ts
unit: "character" | "word";
```

Defined in: [packages/ai/src/types.ts:2399](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2399)

Granularity of each entry.

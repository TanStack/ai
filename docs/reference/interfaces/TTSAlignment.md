---
id: TTSAlignment
title: TTSAlignment
---

Defined in: [packages/ai/src/types.ts:2927](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2927)

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

Defined in: [packages/ai/src/types.ts:2935](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2935)

End of each entry in seconds. Same length as `texts`.

***

### startSeconds

```ts
startSeconds: number[];
```

Defined in: [packages/ai/src/types.ts:2933](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2933)

Start of each entry in seconds. Same length as `texts`.

***

### texts

```ts
texts: string[];
```

Defined in: [packages/ai/src/types.ts:2931](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2931)

Entry text, in audio order.

***

### unit

```ts
unit: "character" | "word";
```

Defined in: [packages/ai/src/types.ts:2929](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2929)

Granularity of each entry.

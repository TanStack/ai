---
id: MediaInputMetadata
title: MediaInputMetadata
---

# Interface: MediaInputMetadata

Defined in: [packages/ai/src/types.ts:1841](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1841)

Metadata convention for image / video / audio inputs to media generation.
Carried on `ImagePart.metadata` / `VideoPart.metadata` / `AudioPart.metadata`
when used as conditioning inputs to `generateImage()` or `generateVideo()`.

## Properties

### role?

```ts
optional role?: MediaInputRole;
```

Defined in: [packages/ai/src/types.ts:1843](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1843)

Optional role hint disambiguating the part's intent for the adapter

***

### tag?

```ts
optional tag?: string;
```

Defined in: [packages/ai/src/types.ts:1852](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1852)

Optional user-defined label for this input (e.g. `'woman-in-red-dress'`).
**Informational only** — adapters never read it and the SDK never
rewrites prompt text based on it. Use it to correlate parts with the
references you write in your prompt using the provider's own syntax
(fal's `@Image1`, OpenAI's "image 1", etc.), or for your own
bookkeeping/logging.

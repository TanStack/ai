---
id: MediaInputMetadata
title: MediaInputMetadata
---

# Interface: MediaInputMetadata

Defined in: [packages/ai/src/types.ts:1515](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1515)

Metadata convention for image / video / audio inputs to media generation.
Carried on `ImagePart.metadata` / `VideoPart.metadata` / `AudioPart.metadata`
when used as conditioning inputs to `generateImage()` or `generateVideo()`.

## Properties

### role?

```ts
optional role: MediaInputRole;
```

Defined in: [packages/ai/src/types.ts:1517](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1517)

Optional role hint disambiguating the part's intent for the adapter

***

### tag?

```ts
optional tag: string;
```

Defined in: [packages/ai/src/types.ts:1526](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1526)

Optional user-defined label for this input (e.g. `'woman-in-red-dress'`).
**Informational only** — adapters never read it and the SDK never
rewrites prompt text based on it. Use it to correlate parts with the
references you write in your prompt using the provider's own syntax
(fal's `@Image1`, OpenAI's "image 1", etc.), or for your own
bookkeeping/logging.

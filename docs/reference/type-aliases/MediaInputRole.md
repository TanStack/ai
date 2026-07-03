---
id: MediaInputRole
title: MediaInputRole
---

# Type Alias: MediaInputRole

```ts
type MediaInputRole = 
  | "reference"
  | "mask"
  | "control"
  | "start_frame"
  | "end_frame"
  | "character";
```

Defined in: [packages/ai/src/types.ts:1575](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1575)

Optional role hint on a media input part (image / video / audio). Adapters
read `metadata.role` to route the part to the provider-specific request
field — e.g. `'mask'` → OpenAI `mask` / fal `mask_url`, `'end_frame'` → fal
`end_image_url`, `'reference'` → fal `reference_image_urls`. When omitted
the adapter falls back to positional routing.

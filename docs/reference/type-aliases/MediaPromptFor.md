---
id: MediaPromptFor
title: MediaPromptFor
---

# Type Alias: MediaPromptFor\<TModalities\>

```ts
type MediaPromptFor<TModalities> = 
  | string
  | (
  | TextPart
  | MediaPartByModality[TModalities])[];
```

Defined in: [packages/ai/src/types.ts:1647](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1647)

Prompt type narrowed to the modalities a specific model supports.
`MediaPromptFor<never>` (a text-only model) is `string | Array<TextPart>`;
`MediaPromptFor<'image'>` additionally admits image parts, etc. Used by
the activity option types together with the adapter's per-model input
modality map so unsupported parts fail at compile time.

## Type Parameters

### TModalities

`TModalities` *extends* [`MediaPromptModality`](MediaPromptModality.md) = `never`

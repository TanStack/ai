---
id: resolveMediaPrompt
title: resolveMediaPrompt
---

# Function: resolveMediaPrompt()

```ts
function resolveMediaPrompt(prompt): ResolvedMediaPrompt;
```

Defined in: [packages/ai/src/utilities/media-prompt.ts:45](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/media-prompt.ts#L45)

Decompose a [MediaPrompt](../type-aliases/MediaPrompt.md) into flattened text and per-modality part
buckets, preserving prompt order everywhere. This is the single downrev
point from the canonical interleaved prompt shape to the named-field
request shapes most providers expose.

## Parameters

### prompt

[`MediaPrompt`](../type-aliases/MediaPrompt.md)

## Returns

[`ResolvedMediaPrompt`](../interfaces/ResolvedMediaPrompt.md)

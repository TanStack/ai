---
id: assertPromptFileSourceSupport
title: assertPromptFileSourceSupport
---

```ts
function assertPromptFileSourceSupport(adapter, prompt): void;
```

Defined in: [packages/ai/src/utilities/content-source.ts:108](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/content-source.ts#L108)

Fail-closed preflight for media prompts and embedding inputs
(`generateImage` / `generateVideo` / `embed`): throws when the input
carries a `{ type: 'file' }` source and the adapter hasn't declared
`supportsFileSources`. Runs in the activity dispatcher — the same layer
that validates modality — so an adapter that predates the file arm can
never receive one. Walks a single part, an array of parts, and nested
arrays (fused embedding items).

## Parameters

### adapter

[`FileSourceCapable`](../interfaces/FileSourceCapable.md)

### prompt

`unknown`

## Returns

`void`

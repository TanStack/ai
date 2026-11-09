---
id: unsupportedFileSourceError
title: unsupportedFileSourceError
---

```ts
function unsupportedFileSourceError(providerName, detail?): Error;
```

Defined in: [packages/ai/src/utilities/content-source.ts:53](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/content-source.ts#L53)

Build the standard error a non-issuer adapter throws when it encounters a
`{ type: 'file' }` source it can't consume — either because the provider has
no file-reference input surface, or because the endpoint requires raw bytes
(image edits, Veo) rather than a reference.

## Parameters

### providerName

`string`

### detail?

`string`

Optional context appended to the message (e.g. a modality or
endpoint name, or a pointer to the adapter that does support references).
When provided it replaces the generic remediation tail, so a site-specific
hint ("pass inline bytes") is never contradicted by generic advice.

## Returns

`Error`

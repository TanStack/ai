---
id: fileReferenceFor
title: fileReferenceFor
---

```ts
function fileReferenceFor(source, providerName): string;
```

Defined in: [packages/ai/src/utilities/content-source.ts:27](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/content-source.ts#L27)

Resolve the handle `providerName` should send for a file source.

A file source carries one opaque handle (`value`) and, optionally, the
provider that issued it. An adapter always knows which provider it talks
to, so a source that names no provider is taken as-is.

## Parameters

### source

[`ContentPartFileSource`](../interfaces/ContentPartFileSource.md)

### providerName

`string`

## Returns

`string`

## Throws

when the source names a different issuing provider. A handle only
resolves at the provider that minted it.

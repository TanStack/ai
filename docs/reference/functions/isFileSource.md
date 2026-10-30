---
id: isFileSource
title: isFileSource
---

```ts
function isFileSource(source): source is ContentPartFileSource<string>;
```

Defined in: [packages/ai/src/utilities/content-source.ts:11](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/content-source.ts#L11)

Narrow a [ContentPartSource](../type-aliases/ContentPartSource.md) to the provider-file-reference arm.

Issuer adapters use this to route a file source to their native wire field;
everyone else is protected by the core preflight (see
[assertMessagesFileSourceSupport](assertMessagesFileSourceSupport.md)) plus a defensive throw at their own
mapping site.

## Parameters

### source

[`ContentPartSource`](../type-aliases/ContentPartSource.md)

## Returns

`source is ContentPartFileSource<string>`

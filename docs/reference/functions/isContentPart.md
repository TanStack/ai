---
id: isContentPart
title: isContentPart
---

```ts
function isContentPart(value): value is ContentPart;
```

Defined in: [packages/ai/src/utilities/tool-result.ts:23](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/tool-result.ts#L23)

Structural check for a single `ContentPart`. A text part must carry a string
`content`. Every other part carries a source with a string `value`; a file
source's `value` is a non-empty opaque handle, and its optional `provider`
is a string.

## Parameters

### value

`unknown`

## Returns

`value is ContentPart`

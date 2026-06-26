---
id: isContentPart
title: isContentPart
---

# Function: isContentPart()

```ts
function isContentPart(value): value is ContentPart;
```

Defined in: [packages/ai/src/utilities/tool-result.ts:16](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/tool-result.ts#L16)

Structural check for a single `ContentPart`. A text part must carry a string
`content`; every other modality must carry a `source` with `type` of
`'url' | 'data'` and a string `value`.

## Parameters

### value

`unknown`

## Returns

`value is ContentPart`

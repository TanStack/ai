---
id: isContentPartArray
title: isContentPartArray
---

# Function: isContentPartArray()

```ts
function isContentPartArray(value): value is ContentPart[];
```

Defined in: [packages/ai/src/utilities/tool-result.ts:42](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/tool-result.ts#L42)

True iff `value` is a NON-EMPTY array whose every element is a valid
`ContentPart`. Empty arrays and mixed arrays return false so they continue
to be treated as ordinary (stringified) data — this keeps the auto-detection
footgun narrow.

## Parameters

### value

`unknown`

## Returns

`value is ContentPart[]`

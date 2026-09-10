---
id: normalizeToolResult
title: normalizeToolResult
---

# Function: normalizeToolResult()

```ts
function normalizeToolResult(result): string | ContentPart[];
```

Defined in: [packages/ai/src/utilities/tool-result.ts:54](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/tool-result.ts#L54)

Normalize a tool's return value for transport:
- string            → unchanged
- ContentPart array → unchanged (multimodal, passed through to the adapter)
- anything else     → `JSON.stringify`

## Parameters

### result

`unknown`

## Returns

`string` \| [`ContentPart`](../type-aliases/ContentPart.md)[]

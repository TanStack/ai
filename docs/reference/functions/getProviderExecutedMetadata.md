---
id: getProviderExecutedMetadata
title: getProviderExecutedMetadata
---

# Function: getProviderExecutedMetadata()

```ts
function getProviderExecutedMetadata(toolCall): 
  | ProviderExecutedToolMetadata
  | null;
```

Defined in: [packages/ai/src/utilities/provider-executed.ts:9](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/provider-executed.ts#L9)

Narrow a tool call's opaque `metadata` to the provider-executed convention.
Returns the typed metadata when the call is provider-executed, else `null`.

## Parameters

### toolCall

\{
`metadata?`: `unknown`;
\} | `null` | `undefined`

## Returns

  \| [`ProviderExecutedToolMetadata`](../interfaces/ProviderExecutedToolMetadata.md)
  \| `null`

## See

ProviderExecutedToolMetadata

---
id: buildBaseUsage
title: buildBaseUsage
---

# Function: buildBaseUsage()

```ts
function buildBaseUsage<TProviderDetails>(input): TokenUsage<TProviderDetails>;
```

Defined in: [packages/ai/src/utilities/usage.ts:33](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/usage.ts#L33)

Builds the base TokenUsage object with core fields.
Provider-specific functions should use this and then add their own details.

## Type Parameters

### TProviderDetails

`TProviderDetails` = `ProviderUsageDetails`

## Parameters

### input

[`BaseUsageInput`](../interfaces/BaseUsageInput.md)

The base token counts

## Returns

`TokenUsage`\<`TProviderDetails`\>

A TokenUsage object with promptTokens, completionTokens, totalTokens

## Example

```typescript
const base = buildBaseUsage({
  promptTokens: 100,
  completionTokens: 50,
  totalTokens: 150
});
// Returns: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
```

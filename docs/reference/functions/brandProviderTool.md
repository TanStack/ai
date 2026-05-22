---
id: brandProviderTool
title: brandProviderTool
---

# Function: brandProviderTool()

```ts
function brandProviderTool<T>(tool): T;
```

Defined in: [packages/typescript/ai/src/tools/provider-tool.ts:35](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tools/provider-tool.ts#L35)

Attach the `ProviderTool` phantom brand to a plain `Tool`-shaped object.

The brand fields (`'~provider'`, `'~toolKind'`) exist only in the type
system and are never assigned at runtime, so this is a single audited
type-only assertion. Use it inside adapter `xxxTool()` factories instead
of `as unknown as` — the cast collapses to one named site.

## Type Parameters

### T

`T` *extends* [`ProviderTool`](../interfaces/ProviderTool.md)\<`string`, `string`\>

## Parameters

### tool

`Omit`\<`T`, `"~provider"` \| `"~toolKind"`\>

## Returns

`T`

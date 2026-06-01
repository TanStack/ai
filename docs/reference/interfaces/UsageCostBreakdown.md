---
id: UsageCostBreakdown
title: UsageCostBreakdown
---

# Interface: UsageCostBreakdown

Defined in: [packages/ai/src/types.ts:988](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L988)

Provider-reported cost breakdown for a single request, normalized onto a
canonical shape so consumer code is portable across gateways. Each adapter's
extractor maps its provider-specific wire keys (e.g. OpenRouter's
`upstream_inference_prompt_cost`, `upstream_inference_input_cost`) onto these
fields at runtime.

## Properties

### upstreamCost?

```ts
optional upstreamCost: number;
```

Defined in: [packages/ai/src/types.ts:990](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L990)

Total cost the gateway paid the upstream provider.

***

### upstreamInputCost?

```ts
optional upstreamInputCost: number;
```

Defined in: [packages/ai/src/types.ts:992](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L992)

Upstream cost for input (prompt) tokens.

***

### upstreamOutputCost?

```ts
optional upstreamOutputCost: number;
```

Defined in: [packages/ai/src/types.ts:994](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L994)

Upstream cost for output (completion) tokens.

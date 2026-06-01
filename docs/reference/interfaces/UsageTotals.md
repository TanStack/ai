---
id: UsageTotals
title: UsageTotals
---

# Interface: UsageTotals

Defined in: [packages/ai/src/types.ts:1004](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1004)

Token usage totals for a run, optionally including provider-reported cost.

`cost` and `costDetails` are populated only by adapters whose provider returns
authoritative per-request cost (e.g. OpenRouter). They are absent for adapters
that do not report cost, so consumers must treat them as optional.

## Extended by

- [`UsageInfo`](UsageInfo.md)

## Properties

### completionTokens

```ts
completionTokens: number;
```

Defined in: [packages/ai/src/types.ts:1006](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1006)

***

### cost?

```ts
optional cost: number;
```

Defined in: [packages/ai/src/types.ts:1009](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1009)

Provider-reported cost for the request, when available.

***

### costDetails?

```ts
optional costDetails: UsageCostBreakdown;
```

Defined in: [packages/ai/src/types.ts:1011](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1011)

Provider-reported cost breakdown, when available.

***

### promptTokens

```ts
promptTokens: number;
```

Defined in: [packages/ai/src/types.ts:1005](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1005)

***

### totalTokens

```ts
totalTokens: number;
```

Defined in: [packages/ai/src/types.ts:1007](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1007)

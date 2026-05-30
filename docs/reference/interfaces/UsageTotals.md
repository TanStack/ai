---
id: UsageTotals
title: UsageTotals
---

# Interface: UsageTotals

Defined in: [packages/ai/src/types.ts:951](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L951)

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

Defined in: [packages/ai/src/types.ts:953](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L953)

***

### cost?

```ts
optional cost: number;
```

Defined in: [packages/ai/src/types.ts:956](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L956)

Provider-reported cost for the request, when available.

***

### costDetails?

```ts
optional costDetails: UsageCostBreakdown;
```

Defined in: [packages/ai/src/types.ts:958](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L958)

Provider-reported cost breakdown, when available.

***

### promptTokens

```ts
promptTokens: number;
```

Defined in: [packages/ai/src/types.ts:952](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L952)

***

### totalTokens

```ts
totalTokens: number;
```

Defined in: [packages/ai/src/types.ts:954](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L954)

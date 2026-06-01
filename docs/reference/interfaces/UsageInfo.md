---
id: UsageInfo
title: UsageInfo
---

# Interface: UsageInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:273](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L273)

Token usage statistics passed to the onUsage hook.
Extracted from the RUN_FINISHED chunk when usage data is present.

Includes optional provider-reported `cost`/`costDetails` (see [UsageTotals](UsageTotals.md)).
Kept as an interface extending `UsageTotals` to preserve declaration merging for
this publicly exported type.

## Extends

- [`UsageTotals`](UsageTotals.md)

## Properties

### completionTokens

```ts
completionTokens: number;
```

Defined in: [packages/ai/src/types.ts:953](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L953)

#### Inherited from

[`UsageTotals`](UsageTotals.md).[`completionTokens`](UsageTotals.md#completiontokens)

***

### cost?

```ts
optional cost: number;
```

Defined in: [packages/ai/src/types.ts:956](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L956)

Provider-reported cost for the request, when available.

#### Inherited from

[`UsageTotals`](UsageTotals.md).[`cost`](UsageTotals.md#cost)

***

### costDetails?

```ts
optional costDetails: UsageCostBreakdown;
```

Defined in: [packages/ai/src/types.ts:958](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L958)

Provider-reported cost breakdown, when available.

#### Inherited from

[`UsageTotals`](UsageTotals.md).[`costDetails`](UsageTotals.md#costdetails)

***

### promptTokens

```ts
promptTokens: number;
```

Defined in: [packages/ai/src/types.ts:952](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L952)

#### Inherited from

[`UsageTotals`](UsageTotals.md).[`promptTokens`](UsageTotals.md#prompttokens)

***

### totalTokens

```ts
totalTokens: number;
```

Defined in: [packages/ai/src/types.ts:954](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L954)

#### Inherited from

[`UsageTotals`](UsageTotals.md).[`totalTokens`](UsageTotals.md#totaltokens)

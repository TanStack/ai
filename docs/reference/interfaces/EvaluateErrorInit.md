---
id: EvaluateErrorInit
title: EvaluateErrorInit
---

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:144](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L144)

Fields for [EvaluateError](../classes/EvaluateError.md).

## Properties

### answers?

```ts
optional answers?: Record<string, WireAnswer>;
```

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:158](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L158)

Wire answers the provider did return, before `decide()` maps them. A
`choice()` answer has `choice`, and a `boolean()` answer is
`{ type: 'noul', noul }`. A refused question has no key.

***

### code

```ts
code: string;
```

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:148](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L148)

Stable code to branch on, for example `EVALUATE_REFUSAL_CODE`.

***

### message

```ts
message: string;
```

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:146](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L146)

Human-readable error text.

***

### model?

```ts
optional model?: string;
```

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:152](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L152)

Resolved model id from the provider.

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:150](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L150)

Tokens the provider reported for this call.

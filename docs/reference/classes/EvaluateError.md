---
id: EvaluateError
title: EvaluateError
---

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:171](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L171)

Thrown by an evaluate adapter when the provider answered, but the call
cannot become a result. It carries what the provider already returned,
so callers can still read the billed usage and the answers that came back.

The `name` is always `EvaluateError`.
Another package can read this shape without an import of this class.
Use [isEvaluateError](../functions/isEvaluateError.md) to narrow a caught value. `instanceof` fails
when the app has more than one copy of `@tanstack/ai`.

## Extends

- `Error`

## Constructors

### Constructor

```ts
new EvaluateError(init): EvaluateError;
```

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:185](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L185)

#### Parameters

##### init

[`EvaluateErrorInit`](../interfaces/EvaluateErrorInit.md)

#### Returns

`EvaluateError`

#### Overrides

```ts
Error.constructor
```

## Properties

### answers?

```ts
readonly optional answers?: Record<string, WireAnswer>;
```

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:183](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L183)

Wire answers the provider did return, before `decide()` maps them. A
`choice()` answer has `choice`, and a `boolean()` answer is
`{ type: 'noul', noul }`. A refused question has no key.

***

### code

```ts
readonly code: string;
```

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:173](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L173)

Stable code to branch on, for example `EVALUATE_REFUSAL_CODE`.

***

### model?

```ts
readonly optional model?: string;
```

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:177](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L177)

Resolved model id from the provider.

***

### usage?

```ts
readonly optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:175](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L175)

Tokens the provider reported for this call.

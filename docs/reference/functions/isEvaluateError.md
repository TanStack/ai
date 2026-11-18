---
id: isEvaluateError
title: isEvaluateError
---

```ts
function isEvaluateError(value): value is EvaluateError;
```

Defined in: [packages/ai/src/activities/evaluate/adapter.ts:210](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/adapter.ts#L210)

This function returns true when `value` has the evaluate error shape.

The check reads `name` and `code`.
A plain object with those fields passes.
The check does not use `instanceof`, so it also matches an error from
another copy of `@tanstack/ai`.

## Parameters

### value

`unknown`

A thrown value, or a plain object

## Returns

`value is EvaluateError`

## Example

```ts
if (isEvaluateError(error) && error.code === EVALUATE_REFUSAL_CODE) {
  error.usage
}
```

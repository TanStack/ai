---
'@tanstack/ai': minor
'@tanstack/ai-openai': minor
---

Add `EvaluateError`, a typed error an evaluate adapter throws when the provider answered but the call cannot become a result. `@tanstack/ai` and `@tanstack/ai/adapters` export the class, the `isEvaluateError()` type guard, the `EvaluateErrorInit` type and `EVALUATE_REFUSAL_CODE`. The error keeps what the provider sent back:

- `code`: a stable code to branch on. A refused question uses `EVALUATE_REFUSAL_CODE` (`'refusal'`).
- `usage`: the tokens the call used.
- `model`: the model that answered.
- `answers`: the raw wire answers that came back, before `decide()` maps them. A `choice()` answer has `choice` (for example `{ type: 'choice', choice: 'billing', ... }`), and a `boolean()` answer is `{ type: 'noul', noul: 0.9 }`, not `{ value }`. The refused question has no key.

When OpenAI refuses to answer a question, `decide()` now throws an `EvaluateError` with `code: 'refusal'` instead of a plain `Error`. If more than one question is refused, the message names the first one.

Use `isEvaluateError(error)` to narrow a caught error. It checks `name` and `code`, not `instanceof`, so it still works when the app installs more than one copy of `@tanstack/ai`.

When an adapter throws an `EvaluateError` that carries `usage`, `decide()` reports that usage through the `evaluate:usage` event and the middleware `onUsage` hook, then runs `onError` and rethrows the same error. `onFinish` does not run.

```ts
try {
  await decide({ adapter, state, questions })
} catch (error) {
  if (isEvaluateError(error) && error.code === EVALUATE_REFUSAL_CODE) {
    console.log(error.usage, error.answers)
  }
  throw error
}
```

The message text does not change. The error is still an `Error`, but its `name` is now `'EvaluateError'`, so logs and the OpenTelemetry `error.type` show that name instead of `'Error'`.

---
id: EvaluateResult
title: EvaluateResult
---

```ts
type EvaluateResult<TQuestions> = { [K in keyof TQuestions as K extends typeof RESERVED_QUESTION_KEY ? never : K]: InferEvaluateAnswer<TQuestions[K]> } & object;
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:127](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L127)

Result of `decide()`. Each question key is a top-level answer.
`meta` holds the resolved model id and usage.

## Type Declaration

### meta

```ts
meta: EvaluateResultMeta;
```

## Type Parameters

### TQuestions

`TQuestions` *extends* `Record`\<`string`, [`WireQuestion`](WireQuestion.md)\>

---
id: decide
title: decide
---

```ts
function decide<TAdapter, TQuestions>(options): Promise<{ [K in string | number | symbol]: InferEvaluateAnswer<TQuestions[K]> } & object>;
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:493](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L493)

Ask typed questions about `state` and get answers your code can branch on.

You have state (a ticket, a record, a log) and you need typed answers, not
prose. Pass questions built with `choice`, `score`, and `boolean`. Then
branch on `result.queue.value` in ordinary TypeScript.

The question key `meta` is reserved. Throws if `questions` is empty or uses
that key.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`EvaluateAdapter`](../interfaces/EvaluateAdapter.md)\<`string`, `EvaluateProviderOptions`\<`TAdapter`\>\>

### TQuestions

`TQuestions` *extends* `Record`\<`string`, [`WireQuestion`](../type-aliases/WireQuestion.md)\>

## Parameters

### options

`EvaluateActivityOptions`\<`TAdapter`, `TQuestions`\>

## Returns

`Promise`\<\{ \[K in string \| number \| symbol\]: InferEvaluateAnswer\<TQuestions\[K\]\> \} & `object`\>

## Example

**Route a support ticket**

```ts
import { decide, choice, score, boolean } from '@tanstack/ai'
import { typesafeDecider } from '@tanstack/ai-typesafe'

const result = await decide({
  adapter: typesafeDecider('jev-latest'),
  state: ticket,
  questions: {
    queue: choice({
      instructions: 'Which team should handle this ticket?',
      options: {
        billing: 'Payments, invoices, refunds',
        tech: 'Bugs, outages, integrations',
        sales: 'Pricing, upgrades, new accounts',
      },
    }),
    urgency: score({
      instructions: 'How urgent is this ticket?',
      levels: ['low', 'medium', 'high'],
    }),
    refund: boolean({
      instructions: 'Is the customer asking for a refund?',
    }),
  },
})

result.queue.value
result.meta.model
result.meta.usage
```

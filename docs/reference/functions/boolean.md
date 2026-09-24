---
id: boolean
title: boolean
---

```ts
function boolean(options): 
  | {
  criteria?: undefined;
  instructions: EvaluateJsonValue;
  type: "noul";
}
  | {
  criteria: {
     false?: string;
     true?: string;
  };
  instructions: EvaluateJsonValue;
  type: "noul";
};
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:419](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L419)

Build a yes/no question.

`.value` is `true` when P(true) is 0.5 or more. There is no `.confidence`.
On the wire, the type is TypeSafe `noul`.

## Parameters

### options

#### criteria?

\{
  `false?`: `string`;
  `true?`: `string`;
\}

Optional descriptions of yes and no.

#### criteria.false?

`string`

#### criteria.true?

`string`

#### instructions

`EvaluateJsonValue`

The yes/no question to judge.

## Returns

  \| \{
  `criteria?`: `undefined`;
  `instructions`: `EvaluateJsonValue`;
  `type`: `"noul"`;
\}
  \| \{
  `criteria`: \{
     `false?`: `string`;
     `true?`: `string`;
  \};
  `instructions`: `EvaluateJsonValue`;
  `type`: `"noul"`;
\}

## Example

```ts
const refund = boolean({
  instructions: 'Is the customer asking for a refund?',
})
```

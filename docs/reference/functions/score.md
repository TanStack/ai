---
id: score
title: score
---

```ts
function score<TLevels>(options): object;
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:389](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L389)

Build a score question. The model rates `state` on ordered `levels`.

You must pass at least two levels. `.value` is the nearest level label.
The raw fraction stays on `.score`. On the wire, `levels` is sent as
TypeSafe `criteria`.

## Type Parameters

### TLevels

`TLevels` *extends* readonly `string`[]

## Parameters

### options

#### instructions

`EvaluateJsonValue`

What the model should rate.

#### levels

`TLevels`

Ordered labels, lowest first. At least two.

## Returns

`object`

### criteria

```ts
criteria: TLevels = options.levels;
```

### instructions

```ts
instructions: EvaluateJsonValue = options.instructions;
```

### type

```ts
type: "score";
```

## Example

```ts
const urgency = score({
  instructions: 'How urgent is this ticket?',
  levels: ['low', 'medium', 'high'],
})
```

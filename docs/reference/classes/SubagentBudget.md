---
id: SubagentBudget
title: SubagentBudget
---

Defined in: packages/ai/src/activities/chat/agents/limits.ts:17

The shared budget of one subagent tree.

## Properties

### deadline

```ts
readonly deadline: number | undefined;
```

Defined in: packages/ai/src/activities/chat/agents/limits.ts:24

Epoch ms after which this run's children must stop, if any.

***

### depth

```ts
readonly depth: number;
```

Defined in: packages/ai/src/activities/chat/agents/limits.ts:21

The depth of the run that owns this budget view.

***

### limits

```ts
readonly limits: SubagentLimits;
```

Defined in: packages/ai/src/activities/chat/agents/limits.ts:19

## Accessors

### calls

#### Get Signature

```ts
get calls(): number;
```

Defined in: packages/ai/src/activities/chat/agents/limits.ts:33

How many children the tree started so far.

##### Returns

`number`

## Methods

### child()

```ts
child(deadline?): SubagentBudget;
```

Defined in: packages/ai/src/activities/chat/agents/limits.ts:72

The budget a child's own subagents use: one level deeper, same counters.

#### Parameters

##### deadline?

`number`

#### Returns

`SubagentBudget`

***

### childTimeout()

```ts
childTimeout(now?): number | undefined;
```

Defined in: packages/ai/src/activities/chat/agents/limits.ts:63

Milliseconds a child started now may run, or `undefined` for no limit.

#### Parameters

##### now?

`number` = `...`

#### Returns

`number` \| `undefined`

***

### release()

```ts
release(): void;
```

Defined in: packages/ai/src/activities/chat/agents/limits.ts:58

Undo one `reserve`. A background start that throws never began.

#### Returns

`void`

***

### reserve()

```ts
reserve(active): string | undefined;
```

Defined in: packages/ai/src/activities/chat/agents/limits.ts:42

Reserve one child spawn. Returns the refusal message the model sees, or
`undefined` when the child may start. `active` is how many children this
run has running now.

#### Parameters

##### active

`number`

#### Returns

`string` \| `undefined`

***

### root()

```ts
static root(limits?): SubagentBudget;
```

Defined in: packages/ai/src/activities/chat/agents/limits.ts:28

A budget for a root run.

#### Parameters

##### limits?

[`SubagentLimits`](../interfaces/SubagentLimits.md) = `{}`

#### Returns

`SubagentBudget`

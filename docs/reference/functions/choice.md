---
id: choice
title: choice
---

```ts
function choice<TOptions>(options): object;
```

Defined in: [packages/ai/src/activities/evaluate/index.ts:361](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/evaluate/index.ts#L361)

Build a choice question. The model picks one key from `options`.

Option keys become the union on `.value`. Use `null` when a key needs no
extra description. On the wire, `options` is sent as TypeSafe `criteria`.

## Type Parameters

### TOptions

`TOptions` *extends* `Record`\<`string`, `string` \| `null`\>

## Parameters

### options

#### instructions

`EvaluateJsonValue`

What the model should decide.

#### options

`TOptions`

Map of option key to description, or `null`.

## Returns

`object`

### criteria

```ts
criteria: TOptions = options.options;
```

### instructions

```ts
instructions: EvaluateJsonValue = options.instructions;
```

### type

```ts
type: "choice";
```

## Example

```ts
const queue = choice({
  instructions: 'Which team should handle this ticket?',
  options: {
    billing: 'Payments, invoices, refunds',
    tech: 'Bugs, outages, integrations',
    sales: 'Pricing, upgrades, new accounts',
  },
})
```

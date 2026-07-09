---
id: CodeModeExternalCallEvent
title: CodeModeExternalCallEvent
---

# Interface: CodeModeExternalCallEvent

Defined in: [packages/ai/src/types.ts:1437](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1437)

Custom event for extensibility.

@ag-ui/core provides: `name`, `value`
TanStack AI adds: `model?`

## Extends

- [`CustomEvent`](CustomEvent.md)

## Indexable

```ts
[k: string]: unknown
```

## Properties

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1314](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1314)

Model identifier for multi-model support

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`model`](CustomEvent.md#model)

***

### name

```ts
name: "code_mode:external_call";
```

Defined in: [packages/ai/src/types.ts:1438](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1438)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1439](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1439)

#### args

```ts
args: unknown;
```

#### function

```ts
function: string;
```

#### timestamp

```ts
timestamp: number;
```

#### Overrides

```ts
CustomEvent.value
```

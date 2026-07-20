---
id: CodeModeExternalCallEvent
title: CodeModeExternalCallEvent
---

# Interface: CodeModeExternalCallEvent

Defined in: [packages/ai/src/types.ts:1430](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1430)

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

Defined in: [packages/ai/src/types.ts:1307](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1307)

Model identifier for multi-model support

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`model`](CustomEvent.md#model)

***

### name

```ts
name: "code_mode:external_call";
```

Defined in: [packages/ai/src/types.ts:1431](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1431)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1432](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1432)

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

---
id: CodeModeExternalResultEvent
title: CodeModeExternalResultEvent
---

# Interface: CodeModeExternalResultEvent

Defined in: [packages/ai/src/types.ts:1441](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1441)

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
name: "code_mode:external_result";
```

Defined in: [packages/ai/src/types.ts:1442](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1442)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1443](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1443)

#### duration

```ts
duration: number;
```

#### function

```ts
function: string;
```

#### result

```ts
result: unknown;
```

#### Overrides

```ts
CustomEvent.value
```

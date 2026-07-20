---
id: CodeModeExternalResultEvent
title: CodeModeExternalResultEvent
---

# Interface: CodeModeExternalResultEvent

Defined in: [packages/ai/src/types.ts:1466](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1466)

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

Defined in: [packages/ai/src/types.ts:1339](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1339)

Model identifier for multi-model support

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`model`](CustomEvent.md#model)

***

### name

```ts
name: "code_mode:external_result";
```

Defined in: [packages/ai/src/types.ts:1467](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1467)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1468](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1468)

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

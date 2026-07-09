---
id: CodeModeExecutionStartedEvent
title: CodeModeExecutionStartedEvent
---

# Interface: CodeModeExecutionStartedEvent

Defined in: [packages/ai/src/types.ts:1425](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1425)

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
name: "code_mode:execution_started";
```

Defined in: [packages/ai/src/types.ts:1426](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1426)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1427](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1427)

#### codeLength

```ts
codeLength: number;
```

#### timestamp

```ts
timestamp: number;
```

#### Overrides

```ts
CustomEvent.value
```

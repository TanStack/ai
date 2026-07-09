---
id: CodeModeConsoleEvent
title: CodeModeConsoleEvent
---

# Interface: CodeModeConsoleEvent

Defined in: [packages/ai/src/types.ts:1429](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1429)

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
name: "code_mode:console";
```

Defined in: [packages/ai/src/types.ts:1430](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1430)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1431](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1431)

#### level

```ts
level: "error" | "log" | "warn" | "info";
```

#### message

```ts
message: string;
```

#### timestamp

```ts
timestamp: number;
```

#### Overrides

```ts
CustomEvent.value
```

---
id: CodeModeConsoleEvent
title: CodeModeConsoleEvent
---

# Interface: CodeModeConsoleEvent

Defined in: [packages/ai/src/types.ts:1413](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1413)

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

Defined in: [packages/ai/src/types.ts:1298](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1298)

Model identifier for multi-model support

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`model`](CustomEvent.md#model)

***

### name

```ts
name: "code_mode:console";
```

Defined in: [packages/ai/src/types.ts:1414](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1414)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1415](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1415)

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

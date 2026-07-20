---
id: CodeModeConsoleEvent
title: CodeModeConsoleEvent
---

# Interface: CodeModeConsoleEvent

Defined in: [packages/ai/src/types.ts:1422](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1422)

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
name: "code_mode:console";
```

Defined in: [packages/ai/src/types.ts:1423](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1423)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1424](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1424)

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

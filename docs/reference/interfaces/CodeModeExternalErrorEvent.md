---
id: CodeModeExternalErrorEvent
title: CodeModeExternalErrorEvent
---

# Interface: CodeModeExternalErrorEvent

Defined in: [packages/ai/src/types.ts:1470](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1470)

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
name: "code_mode:external_error";
```

Defined in: [packages/ai/src/types.ts:1471](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1471)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1472](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1472)

#### duration

```ts
duration: number;
```

#### error

```ts
error: string;
```

#### function

```ts
function: string;
```

#### Overrides

```ts
CustomEvent.value
```

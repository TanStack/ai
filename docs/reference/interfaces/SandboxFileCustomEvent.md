---
id: SandboxFileCustomEvent
title: SandboxFileCustomEvent
---

# Interface: SandboxFileCustomEvent

Defined in: [packages/ai/src/types.ts:1385](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1385)

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
name: "sandbox.file";
```

Defined in: [packages/ai/src/types.ts:1386](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1386)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1387](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1387)

#### path

```ts
path: string;
```

#### timestamp

```ts
timestamp: number;
```

#### type

```ts
type: "create" | "change" | "delete";
```

#### Overrides

```ts
CustomEvent.value
```

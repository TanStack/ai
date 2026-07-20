---
id: SandboxFileCustomEvent
title: SandboxFileCustomEvent
---

# Interface: SandboxFileCustomEvent

Defined in: [packages/ai/src/types.ts:1426](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1426)

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
name: "sandbox.file";
```

Defined in: [packages/ai/src/types.ts:1427](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1427)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1428](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1428)

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

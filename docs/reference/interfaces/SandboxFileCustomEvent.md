---
id: SandboxFileCustomEvent
title: SandboxFileCustomEvent
---

# Interface: SandboxFileCustomEvent

Defined in: [packages/ai/src/types.ts:1394](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1394)

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
name: "sandbox.file";
```

Defined in: [packages/ai/src/types.ts:1395](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1395)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1396](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1396)

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

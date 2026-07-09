---
id: SandboxFileDiffEvent
title: SandboxFileDiffEvent
---

# Interface: SandboxFileDiffEvent

Defined in: [packages/ai/src/types.ts:1393](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1393)

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
name: "sandbox.file.diff";
```

Defined in: [packages/ai/src/types.ts:1394](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1394)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1395](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1395)

#### diff

```ts
diff: string;
```

#### path

```ts
path: string;
```

#### Overrides

```ts
CustomEvent.value
```

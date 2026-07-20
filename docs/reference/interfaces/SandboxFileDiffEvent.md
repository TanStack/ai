---
id: SandboxFileDiffEvent
title: SandboxFileDiffEvent
---

# Interface: SandboxFileDiffEvent

Defined in: [packages/ai/src/types.ts:1402](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1402)

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
name: "sandbox.file.diff";
```

Defined in: [packages/ai/src/types.ts:1403](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1403)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1404](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1404)

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

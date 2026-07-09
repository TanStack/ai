---
id: SandboxFileDiffEvent
title: SandboxFileDiffEvent
---

# Interface: SandboxFileDiffEvent

Defined in: [packages/ai/src/types.ts:1409](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1409)

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
name: "sandbox.file.diff";
```

Defined in: [packages/ai/src/types.ts:1410](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1410)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1411](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1411)

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

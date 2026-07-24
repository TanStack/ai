---
id: SandboxFileDiffEvent
title: SandboxFileDiffEvent
---

# Interface: SandboxFileDiffEvent

Defined in: [packages/ai/src/types.ts:1434](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1434)

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
name: "sandbox.file.diff";
```

Defined in: [packages/ai/src/types.ts:1435](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1435)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1436](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1436)

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

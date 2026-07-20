---
id: FileChangedEvent
title: FileChangedEvent
---

# Interface: FileChangedEvent

Defined in: [packages/ai/src/types.ts:1408](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1408)

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
name: "file.changed";
```

Defined in: [packages/ai/src/types.ts:1409](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1409)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1410](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1410)

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

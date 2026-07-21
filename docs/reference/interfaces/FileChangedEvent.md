---
id: FileChangedEvent
title: FileChangedEvent
---

# Interface: FileChangedEvent

Defined in: [packages/ai/src/types.ts:1440](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1440)

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
name: "file.changed";
```

Defined in: [packages/ai/src/types.ts:1441](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1441)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1442](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1442)

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

---
id: SessionIdEvent
title: SessionIdEvent
---

# Interface: SessionIdEvent

Defined in: [packages/ai/src/types.ts:1419](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1419)

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
name: `${string}.session-id`;
```

Defined in: [packages/ai/src/types.ts:1420](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1420)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1421](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1421)

#### sessionId

```ts
sessionId: string;
```

#### Overrides

```ts
CustomEvent.value
```

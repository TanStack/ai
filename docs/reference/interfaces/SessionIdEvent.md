---
id: SessionIdEvent
title: SessionIdEvent
---

# Interface: SessionIdEvent

Defined in: [packages/ai/src/types.ts:1412](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1412)

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
name: `${string}.session-id`;
```

Defined in: [packages/ai/src/types.ts:1413](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1413)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1414](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1414)

#### sessionId

```ts
sessionId: string;
```

#### Overrides

```ts
CustomEvent.value
```

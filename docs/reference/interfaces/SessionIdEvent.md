---
id: SessionIdEvent
title: SessionIdEvent
---

Defined in: [packages/ai/src/types.ts:1503](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1503)

Custom event for extensibility.

@ag-ui/core provides: `name`, `value`

Uses `Pick` (not `extends`) so the Zod passthrough index signature does not
erase discriminant property access on [KnownCustomEvent](../type-aliases/KnownCustomEvent.md) unions.

## Extends

- [`CustomEvent`](CustomEvent.md)

## Properties

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1390](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1390)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`metadata`](CustomEvent.md#metadata)

***

### name

```ts
name: `${string}.session-id`;
```

Defined in: [packages/ai/src/types.ts:1504](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1504)

#### Overrides

```ts
CustomEvent.name
```

***

### type

```ts
type: "CUSTOM";
```

Defined in: [packages/ai/src/types.ts:1389](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1389)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`type`](CustomEvent.md#type)

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1505](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1505)

#### sessionId

```ts
sessionId: string;
```

#### Overrides

```ts
CustomEvent.value
```

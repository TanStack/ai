---
id: FileChangedEvent
title: FileChangedEvent
---

# Interface: FileChangedEvent

Defined in: [packages/ai/src/types.ts:1459](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1459)

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

Defined in: [packages/ai/src/types.ts:1350](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1350)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`metadata`](CustomEvent.md#metadata)

***

### name

```ts
name: "file.changed";
```

Defined in: [packages/ai/src/types.ts:1460](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1460)

#### Overrides

```ts
CustomEvent.name
```

***

### type

```ts
type: "CUSTOM";
```

Defined in: [packages/ai/src/types.ts:1349](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1349)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`type`](CustomEvent.md#type)

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1461](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1461)

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

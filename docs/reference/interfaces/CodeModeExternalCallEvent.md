---
id: CodeModeExternalCallEvent
title: CodeModeExternalCallEvent
---

# Interface: CodeModeExternalCallEvent

Defined in: [packages/ai/src/types.ts:1499](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1499)

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

Defined in: [packages/ai/src/types.ts:1368](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1368)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`metadata`](CustomEvent.md#metadata)

***

### name

```ts
name: "code_mode:external_call";
```

Defined in: [packages/ai/src/types.ts:1500](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1500)

#### Overrides

```ts
CustomEvent.name
```

***

### type

```ts
type: "CUSTOM";
```

Defined in: [packages/ai/src/types.ts:1367](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1367)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`type`](CustomEvent.md#type)

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1501](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1501)

#### args

```ts
args: unknown;
```

#### function

```ts
function: string;
```

#### timestamp

```ts
timestamp: number;
```

#### Overrides

```ts
CustomEvent.value
```

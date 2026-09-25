---
id: SandboxFileCustomEvent
title: SandboxFileCustomEvent
---

Defined in: [packages/ai/src/types.ts:1511](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1511)

Custom event for extensibility.

@ag-ui/core provides: `name`, `value`, `subagentRunId?`

## Extends

- [`CustomEvent`](CustomEvent.md)

## Properties

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1416](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1416)

Extra information attached to this event.

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`metadata`](CustomEvent.md#metadata)

***

### name

```ts
name: "sandbox.file";
```

Defined in: [packages/ai/src/types.ts:1512](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1512)

What this custom event is. Required: without it a consumer cannot route
the value.

#### Overrides

```ts
CustomEvent.name
```

***

### type

```ts
type: "CUSTOM";
```

Defined in: [packages/ai/src/types.ts:1415](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1415)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`type`](CustomEvent.md#type)

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1513](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1513)

The payload. Any JSON value, and required.

#### path

```ts
path: string;
```

#### timestamp

```ts
timestamp: number;
```

#### type

```ts
type: "create" | "change" | "delete";
```

#### Overrides

```ts
CustomEvent.value
```

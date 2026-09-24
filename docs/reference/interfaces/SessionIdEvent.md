---
id: SessionIdEvent
title: SessionIdEvent
---

Defined in: [packages/ai/src/types.ts:1513](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1513)

Custom event for extensibility.

@ag-ui/core provides: `name`, `value`, `subagentRunId?`

## Extends

- [`CustomEvent`](CustomEvent.md)

## Properties

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1400](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1400)

Extra information attached to this event.

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`metadata`](CustomEvent.md#metadata)

***

### name

```ts
name: `${string}.session-id`;
```

Defined in: [packages/ai/src/types.ts:1514](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1514)

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

Defined in: [packages/ai/src/types.ts:1399](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1399)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`type`](CustomEvent.md#type)

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1515](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1515)

The payload. Any JSON value, and required.

#### sessionId

```ts
sessionId: string;
```

#### Overrides

```ts
CustomEvent.value
```

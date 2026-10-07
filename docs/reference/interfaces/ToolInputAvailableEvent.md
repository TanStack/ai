---
id: ToolInputAvailableEvent
title: ToolInputAvailableEvent
---

Defined in: [packages/ai/src/types.ts:1582](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1582)

## Deprecated

Native interrupts use RUN_FINISHED interrupt outcomes. This
compatibility event remains readable until 1.0.

## Extends

- [`CustomEvent`](CustomEvent.md)

## Properties

### ~~metadata?~~

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1510](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1510)

Extra information attached to this event.

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`metadata`](CustomEvent.md#metadata)

***

### ~~name~~

```ts
name: "tool-input-available";
```

Defined in: [packages/ai/src/types.ts:1583](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1583)

What this custom event is. Required: without it a consumer cannot route
the value.

#### Overrides

```ts
CustomEvent.name
```

***

### ~~type~~

```ts
type: "CUSTOM";
```

Defined in: [packages/ai/src/types.ts:1509](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1509)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`type`](CustomEvent.md#type)

***

### ~~value~~

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1584](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1584)

The payload. Any JSON value, and required.

#### ~~input~~

```ts
input: unknown;
```

#### ~~toolCallId~~

```ts
toolCallId: string;
```

#### ~~toolName~~

```ts
toolName: string;
```

#### Overrides

```ts
CustomEvent.value
```

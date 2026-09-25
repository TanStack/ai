---
id: ToolInputAvailableEvent
title: ToolInputAvailableEvent
---

Defined in: [packages/ai/src/types.ts:1488](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1488)

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

Defined in: [packages/ai/src/types.ts:1416](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1416)

Extra information attached to this event.

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`metadata`](CustomEvent.md#metadata)

***

### ~~name~~

```ts
name: "tool-input-available";
```

Defined in: [packages/ai/src/types.ts:1489](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1489)

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

Defined in: [packages/ai/src/types.ts:1415](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1415)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`type`](CustomEvent.md#type)

***

### ~~value~~

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1490](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1490)

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

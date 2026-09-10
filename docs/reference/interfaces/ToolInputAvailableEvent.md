---
id: ToolInputAvailableEvent
title: ToolInputAvailableEvent
---

# ~~Interface: ToolInputAvailableEvent~~

Defined in: [packages/ai/src/types.ts:1440](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1440)

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

Defined in: [packages/ai/src/types.ts:1368](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1368)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`metadata`](CustomEvent.md#metadata)

***

### ~~name~~

```ts
name: "tool-input-available";
```

Defined in: [packages/ai/src/types.ts:1441](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1441)

#### Overrides

```ts
CustomEvent.name
```

***

### ~~type~~

```ts
type: "CUSTOM";
```

Defined in: [packages/ai/src/types.ts:1367](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1367)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`type`](CustomEvent.md#type)

***

### ~~value~~

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1442](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1442)

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

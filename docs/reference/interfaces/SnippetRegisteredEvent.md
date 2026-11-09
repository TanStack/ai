---
id: SnippetRegisteredEvent
title: SnippetRegisteredEvent
---

Defined in: [packages/ai/src/types.ts:1964](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1964)

Custom event for extensibility.

@ag-ui/core provides: `name`, `value`, `subagentRunId?`

## Extends

- [`CustomEvent`](CustomEvent.md)

## Properties

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1829](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1829)

Extra information attached to this event.

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`metadata`](CustomEvent.md#metadata)

***

### name

```ts
name: "snippet:registered";
```

Defined in: [packages/ai/src/types.ts:1965](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1965)

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

Defined in: [packages/ai/src/types.ts:1828](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1828)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`type`](CustomEvent.md#type)

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1966](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1966)

The payload. Any JSON value, and required.

#### description

```ts
description: string;
```

#### id

```ts
id: string;
```

#### name

```ts
name: string;
```

#### timestamp

```ts
timestamp: number;
```

#### Overrides

```ts
CustomEvent.value
```

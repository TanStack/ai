---
id: CodeModeExternalErrorEvent
title: CodeModeExternalErrorEvent
---

Defined in: [packages/ai/src/types.ts:1670](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1670)

Custom event for extensibility.

@ag-ui/core provides: `name`, `value`, `subagentRunId?`

## Extends

- [`CustomEvent`](CustomEvent.md)

## Properties

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1531](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1531)

Extra information attached to this event.

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`metadata`](CustomEvent.md#metadata)

***

### name

```ts
name: "code_mode:external_error";
```

Defined in: [packages/ai/src/types.ts:1671](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1671)

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

Defined in: [packages/ai/src/types.ts:1530](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1530)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`type`](CustomEvent.md#type)

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1672](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1672)

The payload. Any JSON value, and required.

#### duration

```ts
duration: number;
```

#### error

```ts
error: string;
```

#### function

```ts
function: string;
```

#### Overrides

```ts
CustomEvent.value
```

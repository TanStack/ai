---
id: CodeModeExternalResultEvent
title: CodeModeExternalResultEvent
---

Defined in: [packages/ai/src/types.ts:1924](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1924)

Custom event for extensibility.

@ag-ui/core provides: `name`, `value`, `subagentRunId?`

## Extends

- [`CustomEvent`](CustomEvent.md)

## Properties

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1789](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1789)

Extra information attached to this event.

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`metadata`](CustomEvent.md#metadata)

***

### name

```ts
name: "code_mode:external_result";
```

Defined in: [packages/ai/src/types.ts:1925](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1925)

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

Defined in: [packages/ai/src/types.ts:1788](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1788)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`type`](CustomEvent.md#type)

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1926](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1926)

The payload. Any JSON value, and required.

#### duration

```ts
duration: number;
```

#### function

```ts
function: string;
```

#### result

```ts
result: unknown;
```

#### Overrides

```ts
CustomEvent.value
```

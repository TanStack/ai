---
id: CodeModeExternalResultEvent
title: CodeModeExternalResultEvent
---

Defined in: [packages/ai/src/types.ts:1909](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1909)

Custom event for extensibility.

@ag-ui/core provides: `name`, `value`, `subagentRunId?`

## Extends

- [`CustomEvent`](CustomEvent.md)

## Properties

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1814](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1814)

Extra information attached to this event.

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`metadata`](CustomEvent.md#metadata)

***

### name

```ts
name: "code_mode:external_result";
```

Defined in: [packages/ai/src/types.ts:1910](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1910)

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

Defined in: [packages/ai/src/types.ts:1813](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1813)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`type`](CustomEvent.md#type)

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1911](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1911)

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

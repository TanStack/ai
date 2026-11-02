---
id: CodeModeExecutionStartedEvent
title: CodeModeExecutionStartedEvent
---

Defined in: [packages/ai/src/types.ts:1893](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1893)

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
name: "code_mode:execution_started";
```

Defined in: [packages/ai/src/types.ts:1894](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1894)

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

Defined in: [packages/ai/src/types.ts:1895](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1895)

The payload. Any JSON value, and required.

#### codeLength

```ts
codeLength: number;
```

#### timestamp

```ts
timestamp: number;
```

#### Overrides

```ts
CustomEvent.value
```

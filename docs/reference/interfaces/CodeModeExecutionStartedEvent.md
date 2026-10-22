---
id: CodeModeExecutionStartedEvent
title: CodeModeExecutionStartedEvent
---

Defined in: [packages/ai/src/types.ts:1908](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1908)

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
name: "code_mode:execution_started";
```

Defined in: [packages/ai/src/types.ts:1909](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1909)

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

Defined in: [packages/ai/src/types.ts:1910](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1910)

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

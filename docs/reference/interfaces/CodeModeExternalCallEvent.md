---
id: CodeModeExternalCallEvent
title: CodeModeExternalCallEvent
---

Defined in: [packages/ai/src/types.ts:1547](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1547)

Custom event for extensibility.

@ag-ui/core provides: `name`, `value`, `subagentRunId?`

## Extends

- [`CustomEvent`](CustomEvent.md)

## Properties

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1416](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1416)

Extra information attached to this event.

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`metadata`](CustomEvent.md#metadata)

***

### name

```ts
name: "code_mode:external_call";
```

Defined in: [packages/ai/src/types.ts:1548](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1548)

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

Defined in: [packages/ai/src/types.ts:1415](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1415)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`type`](CustomEvent.md#type)

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1549](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1549)

The payload. Any JSON value, and required.

#### args

```ts
args: unknown;
```

#### function

```ts
function: string;
```

#### timestamp

```ts
timestamp: number;
```

#### Overrides

```ts
CustomEvent.value
```

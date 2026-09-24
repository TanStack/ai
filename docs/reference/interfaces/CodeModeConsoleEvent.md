---
id: CodeModeConsoleEvent
title: CodeModeConsoleEvent
---

Defined in: [packages/ai/src/types.ts:1523](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1523)

Custom event for extensibility.

@ag-ui/core provides: `name`, `value`, `subagentRunId?`

## Extends

- [`CustomEvent`](CustomEvent.md)

## Properties

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1400](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1400)

Extra information attached to this event.

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`metadata`](CustomEvent.md#metadata)

***

### name

```ts
name: "code_mode:console";
```

Defined in: [packages/ai/src/types.ts:1524](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1524)

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

Defined in: [packages/ai/src/types.ts:1399](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1399)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`type`](CustomEvent.md#type)

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1525](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1525)

The payload. Any JSON value, and required.

#### level

```ts
level: "error" | "info" | "warn" | "log";
```

#### message

```ts
message: string;
```

#### timestamp

```ts
timestamp: number;
```

#### Overrides

```ts
CustomEvent.value
```

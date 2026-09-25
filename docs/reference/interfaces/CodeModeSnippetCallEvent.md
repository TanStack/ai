---
id: CodeModeSnippetCallEvent
title: CodeModeSnippetCallEvent
---

Defined in: [packages/ai/src/types.ts:1559](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1559)

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
name: "code_mode:snippet_call";
```

Defined in: [packages/ai/src/types.ts:1560](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1560)

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

Defined in: [packages/ai/src/types.ts:1561](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1561)

The payload. Any JSON value, and required.

#### input

```ts
input: unknown;
```

#### snippet

```ts
snippet: string;
```

#### timestamp

```ts
timestamp: number;
```

#### Overrides

```ts
CustomEvent.value
```

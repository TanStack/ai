---
id: CodeModeSnippetCallEvent
title: CodeModeSnippetCallEvent
---

Defined in: [packages/ai/src/types.ts:1653](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1653)

Custom event for extensibility.

@ag-ui/core provides: `name`, `value`, `subagentRunId?`

## Extends

- [`CustomEvent`](CustomEvent.md)

## Properties

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1510](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1510)

Extra information attached to this event.

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`metadata`](CustomEvent.md#metadata)

***

### name

```ts
name: "code_mode:snippet_call";
```

Defined in: [packages/ai/src/types.ts:1654](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1654)

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

Defined in: [packages/ai/src/types.ts:1509](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1509)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`type`](CustomEvent.md#type)

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1655](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1655)

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

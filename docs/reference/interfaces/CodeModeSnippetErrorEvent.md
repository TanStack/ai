---
id: CodeModeSnippetErrorEvent
title: CodeModeSnippetErrorEvent
---

Defined in: [packages/ai/src/types.ts:1939](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1939)

Custom event for extensibility.

@ag-ui/core provides: `name`, `value`, `subagentRunId?`

## Extends

- [`CustomEvent`](CustomEvent.md)

## Properties

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1783](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1783)

Extra information attached to this event.

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`metadata`](CustomEvent.md#metadata)

***

### name

```ts
name: "code_mode:snippet_error";
```

Defined in: [packages/ai/src/types.ts:1940](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1940)

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

Defined in: [packages/ai/src/types.ts:1782](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1782)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`type`](CustomEvent.md#type)

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1941](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1941)

The payload. Any JSON value, and required.

#### duration

```ts
duration: number;
```

#### error

```ts
error: string;
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

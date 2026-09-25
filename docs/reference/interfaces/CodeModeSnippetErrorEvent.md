---
id: CodeModeSnippetErrorEvent
title: CodeModeSnippetErrorEvent
---

Defined in: [packages/ai/src/types.ts:1572](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1572)

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
name: "code_mode:snippet_error";
```

Defined in: [packages/ai/src/types.ts:1573](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1573)

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

Defined in: [packages/ai/src/types.ts:1574](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1574)

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

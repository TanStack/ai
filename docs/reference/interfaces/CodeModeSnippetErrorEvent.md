---
id: CodeModeSnippetErrorEvent
title: CodeModeSnippetErrorEvent
---

Defined in: [packages/ai/src/types.ts:1945](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1945)

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
name: "code_mode:snippet_error";
```

Defined in: [packages/ai/src/types.ts:1946](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1946)

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

Defined in: [packages/ai/src/types.ts:1947](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1947)

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

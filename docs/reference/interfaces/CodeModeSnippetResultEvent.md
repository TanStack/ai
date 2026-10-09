---
id: CodeModeSnippetResultEvent
title: CodeModeSnippetResultEvent
---

Defined in: [packages/ai/src/types.ts:1678](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1678)

Custom event for extensibility.

@ag-ui/core provides: `name`, `value`, `subagentRunId?`

## Extends

- [`CustomEvent`](CustomEvent.md)

## Properties

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1531](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1531)

Extra information attached to this event.

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`metadata`](CustomEvent.md#metadata)

***

### name

```ts
name: "code_mode:snippet_result";
```

Defined in: [packages/ai/src/types.ts:1679](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1679)

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

Defined in: [packages/ai/src/types.ts:1530](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1530)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`type`](CustomEvent.md#type)

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1680](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1680)

The payload. Any JSON value, and required.

#### duration

```ts
duration: number;
```

#### result

```ts
result: unknown;
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

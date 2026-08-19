---
id: CodeModeExecutionStartedEvent
title: CodeModeExecutionStartedEvent
---

# Interface: CodeModeExecutionStartedEvent

Defined in: [packages/ai/src/types.ts:1537](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1537)

Custom event for extensibility.

@ag-ui/core provides: `name`, `value`
TanStack AI adds: `model?`

Uses `Pick` (not `extends`) so the Zod passthrough index signature does not
erase discriminant property access on [KnownCustomEvent](../type-aliases/KnownCustomEvent.md) /
[TypedStreamChunk](../type-aliases/TypedStreamChunk.md) unions.

## Extends

- [`CustomEvent`](CustomEvent.md)

## Properties

### model?

```ts
optional model?: string;
```

Defined in: [packages/ai/src/types.ts:1410](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1410)

Model identifier for multi-model support

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`model`](CustomEvent.md#model)

***

### name

```ts
name: "code_mode:execution_started";
```

Defined in: [packages/ai/src/types.ts:1538](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1538)

#### Overrides

```ts
CustomEvent.name
```

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:1418](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1418)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`runId`](CustomEvent.md#runid)

***

### threadId?

```ts
optional threadId?: string;
```

Defined in: [packages/ai/src/types.ts:1417](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1417)

Routing metadata the TanStack engine attaches when emitting CUSTOM
events that need to be correlated with a specific thread/run.
Stripped by `strip-to-spec-middleware` before going on the wire so
the AG-UI consumer never sees them (when that middleware is enabled).

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`threadId`](CustomEvent.md#threadid)

***

### type

```ts
type: "CUSTOM";
```

Defined in: [packages/ai/src/types.ts:1408](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1408)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`type`](CustomEvent.md#type)

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1539](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1539)

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

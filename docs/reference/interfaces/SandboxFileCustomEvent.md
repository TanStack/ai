---
id: SandboxFileCustomEvent
title: SandboxFileCustomEvent
---

# Interface: SandboxFileCustomEvent

Defined in: [packages/ai/src/types.ts:1525](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1525)

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

Defined in: [packages/ai/src/types.ts:1422](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1422)

Model identifier for multi-model support

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`model`](CustomEvent.md#model)

***

### name

```ts
name: "sandbox.file";
```

Defined in: [packages/ai/src/types.ts:1526](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1526)

#### Overrides

```ts
CustomEvent.name
```

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:1430](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1430)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`runId`](CustomEvent.md#runid)

***

### threadId?

```ts
optional threadId?: string;
```

Defined in: [packages/ai/src/types.ts:1429](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1429)

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

Defined in: [packages/ai/src/types.ts:1420](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1420)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`type`](CustomEvent.md#type)

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1527](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1527)

#### path

```ts
path: string;
```

#### timestamp

```ts
timestamp: number;
```

#### type

```ts
type: "create" | "change" | "delete";
```

#### Overrides

```ts
CustomEvent.value
```

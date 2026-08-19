---
id: ToolInputAvailableEvent
title: ToolInputAvailableEvent
---

# ~~Interface: ToolInputAvailableEvent~~

Defined in: [packages/ai/src/types.ts:1490](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1490)

## Deprecated

Native interrupts use RUN_FINISHED interrupt outcomes. This
compatibility event remains readable until 1.0.

## Extends

- [`CustomEvent`](CustomEvent.md)

## Properties

### ~~model?~~

```ts
optional model?: string;
```

Defined in: [packages/ai/src/types.ts:1410](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1410)

Model identifier for multi-model support

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`model`](CustomEvent.md#model)

***

### ~~name~~

```ts
name: "tool-input-available";
```

Defined in: [packages/ai/src/types.ts:1491](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1491)

#### Overrides

```ts
CustomEvent.name
```

***

### ~~runId?~~

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:1418](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1418)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`runId`](CustomEvent.md#runid)

***

### ~~threadId?~~

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

### ~~type~~

```ts
type: "CUSTOM";
```

Defined in: [packages/ai/src/types.ts:1408](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1408)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`type`](CustomEvent.md#type)

***

### ~~value~~

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1492](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1492)

#### ~~input~~

```ts
input: unknown;
```

#### ~~toolCallId~~

```ts
toolCallId: string;
```

#### ~~toolName~~

```ts
toolName: string;
```

#### Overrides

```ts
CustomEvent.value
```

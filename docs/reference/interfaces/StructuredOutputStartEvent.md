---
id: StructuredOutputStartEvent
title: StructuredOutputStartEvent
---

# Interface: StructuredOutputStartEvent

Defined in: [packages/ai/src/types.ts:1466](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1466)

Emitted at the start of a streaming structured-output run, before the JSON
deltas. Tells consumers that the upcoming `TEXT_MESSAGE_CONTENT` deltas
belong to a structured response so they can route those bytes into a
`StructuredOutputPart` instead of building a `TextPart`. Carries the
`messageId` the deltas will be tagged with so the routing decision can be
made per-message rather than globally.

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
name: "structured-output.start";
```

Defined in: [packages/ai/src/types.ts:1467](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1467)

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

Defined in: [packages/ai/src/types.ts:1468](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1468)

#### messageId

```ts
messageId: string;
```

#### Overrides

```ts
CustomEvent.value
```

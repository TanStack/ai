---
id: CodeModeSkillCallEvent
title: CodeModeSkillCallEvent
---

# Interface: CodeModeSkillCallEvent

Defined in: [packages/ai/src/types.ts:1558](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1558)

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

Defined in: [packages/ai/src/types.ts:1407](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1407)

Model identifier for multi-model support

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`model`](CustomEvent.md#model)

***

### name

```ts
name: "code_mode:skill_call";
```

Defined in: [packages/ai/src/types.ts:1559](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1559)

#### Overrides

```ts
CustomEvent.name
```

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:1415](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1415)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`runId`](CustomEvent.md#runid)

***

### threadId?

```ts
optional threadId?: string;
```

Defined in: [packages/ai/src/types.ts:1414](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1414)

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

Defined in: [packages/ai/src/types.ts:1405](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1405)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`type`](CustomEvent.md#type)

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1560](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1560)

#### input

```ts
input: unknown;
```

#### skill

```ts
skill: string;
```

#### timestamp

```ts
timestamp: number;
```

#### Overrides

```ts
CustomEvent.value
```

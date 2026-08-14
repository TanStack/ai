---
id: UIResourceEvent
title: UIResourceEvent
---

# Interface: UIResourceEvent

Defined in: [packages/ai/src/types.ts:1498](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1498)

Emitted when an MCP tool returns a ui:// resource (MCP Apps). Reconciled into
 a UIResourcePart on the assistant UIMessage. Never enters model input.

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
name: "ui-resource";
```

Defined in: [packages/ai/src/types.ts:1499](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1499)

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

Defined in: [packages/ai/src/types.ts:1500](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1500)

#### meta?

```ts
optional meta?: Record<string, unknown>;
```

#### resource

```ts
resource: object;
```

##### resource.blob?

```ts
optional blob?: string;
```

##### resource.mimeType

```ts
mimeType: string;
```

##### resource.text?

```ts
optional text?: string;
```

##### resource.uri

```ts
uri: string;
```

#### serverId?

```ts
optional serverId?: string;
```

#### toolCallId

```ts
toolCallId: string;
```

#### toolName

```ts
toolName: string;
```

#### Overrides

```ts
CustomEvent.value
```

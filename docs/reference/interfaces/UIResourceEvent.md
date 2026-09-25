---
id: UIResourceEvent
title: UIResourceEvent
---

Defined in: [packages/ai/src/types.ts:1499](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1499)

Emitted when an MCP tool returns a ui:// resource (MCP Apps). Reconciled into
 a UIResourcePart on the assistant UIMessage. Never enters model input.

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
name: "ui-resource";
```

Defined in: [packages/ai/src/types.ts:1500](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1500)

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

Defined in: [packages/ai/src/types.ts:1501](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1501)

The payload. Any JSON value, and required.

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

---
id: UIResourceEvent
title: UIResourceEvent
---

# Interface: UIResourceEvent

Defined in: [packages/ai/src/types.ts:1433](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1433)

Emitted when an MCP tool returns a ui:// resource (MCP Apps). Reconciled into
 a UIResourcePart on the assistant UIMessage. Never enters model input.

## Extends

- [`CustomEvent`](CustomEvent.md)

## Properties

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1350](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1350)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`metadata`](CustomEvent.md#metadata)

***

### name

```ts
name: "ui-resource";
```

Defined in: [packages/ai/src/types.ts:1434](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1434)

#### Overrides

```ts
CustomEvent.name
```

***

### type

```ts
type: "CUSTOM";
```

Defined in: [packages/ai/src/types.ts:1349](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1349)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`type`](CustomEvent.md#type)

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1435](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1435)

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

---
id: UIResourceEvent
title: UIResourceEvent
---

# Interface: UIResourceEvent

Defined in: [packages/ai/src/types.ts:1351](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1351)

Emitted when an MCP tool returns a ui:// resource (MCP Apps). Reconciled into
 a UIResourcePart on the assistant UIMessage. Never enters model input.

## Extends

- [`CustomEvent`](CustomEvent.md)

## Indexable

```ts
[k: string]: unknown
```

## Properties

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1276](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1276)

Model identifier for multi-model support

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`model`](CustomEvent.md#model)

***

### name

```ts
name: "ui-resource";
```

Defined in: [packages/ai/src/types.ts:1352](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1352)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1353](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1353)

#### meta?

```ts
optional meta: Record<string, unknown>;
```

#### resource

```ts
resource: object;
```

##### resource.blob?

```ts
optional blob: string;
```

##### resource.mimeType

```ts
mimeType: string;
```

##### resource.text?

```ts
optional text: string;
```

##### resource.uri

```ts
uri: string;
```

#### serverId?

```ts
optional serverId: string;
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

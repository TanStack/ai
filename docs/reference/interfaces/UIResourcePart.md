---
id: UIResourcePart
title: UIResourcePart
---

Defined in: [packages/ai/src/types.ts:524](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L524)

## Properties

### meta?

```ts
optional meta?: Record<string, unknown>;
```

Defined in: [packages/ai/src/types.ts:538](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L538)

Reserved for future passthrough of the resource/tool `_meta.ui` (e.g. frame-size hints).
 Currently always `undefined` — nothing populates this field yet.

***

### resource

```ts
resource: object;
```

Defined in: [packages/ai/src/types.ts:527](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L527)

The ui:// resource object in MCP-native shape — fed straight to the renderer.

#### blob?

```ts
optional blob?: string;
```

#### mimeType

```ts
mimeType: string;
```

#### text?

```ts
optional text?: string;
```

#### uri

```ts
uri: string;
```

***

### serverId?

```ts
optional serverId?: string;
```

Defined in: [packages/ai/src/types.ts:529](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L529)

Pool prefix / config key — routes interactive calls to the right MCP server.

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/types.ts:532](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L532)

Links the widget to the originating tool call — correlates it with the
 sibling ToolCallPart/ToolResultPart in the same message.

***

### toolName

```ts
toolName: string;
```

Defined in: [packages/ai/src/types.ts:535](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L535)

Server-native (unprefixed) MCP tool name whose UI this resource renders.
 Required by the renderer (`@mcp-ui/client`'s `AppRenderer` `toolName` prop).

***

### type

```ts
type: "ui-resource";
```

Defined in: [packages/ai/src/types.ts:525](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L525)

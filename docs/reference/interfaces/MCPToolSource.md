---
id: MCPToolSource
title: MCPToolSource
---

# Interface: MCPToolSource

Defined in: [packages/ai/src/activities/chat/mcp/types.ts:10](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/mcp/types.ts#L10)

Minimal structural shape that `chat({ mcp })` needs from an MCP client.

`@tanstack/ai-mcp`'s `MCPClient` and `MCPClients` satisfy this interface by
shape — the core `@tanstack/ai` package does NOT import `@tanstack/ai-mcp`
(ai-mcp depends on ai, not the reverse).

## Properties

### close()

```ts
close: () => Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/mcp/types.ts:15](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/mcp/types.ts#L15)

#### Returns

`Promise`\<`void`\>

***

### tools()

```ts
tools: (options?) => Promise<ServerTool<SchemaInput, SchemaInput, string, unknown>[]>;
```

Defined in: [packages/ai/src/activities/chat/mcp/types.ts:14](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/mcp/types.ts#L14)

#### Parameters

##### options?

###### lazy?

`boolean`

#### Returns

`Promise`\<[`ServerTool`](ServerTool.md)\<[`SchemaInput`](../type-aliases/SchemaInput.md), [`SchemaInput`](../type-aliases/SchemaInput.md), `string`, `unknown`\>[]\>

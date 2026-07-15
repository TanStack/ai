---
id: MCPToolSource
title: MCPToolSource
---

# Interface: MCPToolSource

Defined in: [packages/ai/src/activities/chat/mcp/types.ts:25](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/mcp/types.ts#L25)

Minimal structural shape that `chat({ mcp })` needs from an MCP client.

`@tanstack/ai-mcp`'s `MCPClient` and `MCPClients` satisfy this interface by
shape — the core `@tanstack/ai` package does NOT import `@tanstack/ai-mcp`
(ai-mcp depends on ai, not the reverse).

## Properties

### close()

```ts
close: () => Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/mcp/types.ts:30](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/mcp/types.ts#L30)

#### Returns

`Promise`\<`void`\>

***

### readResource()?

```ts
optional readResource: (uri) => Promise<McpResourceReadResult>;
```

Defined in: [packages/ai/src/activities/chat/mcp/types.ts:38](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/mcp/types.ts#L38)

Reads an MCP resource by URI. Used by the chat manager to eagerly fetch
`ui://` resource widgets (MCP Apps) after a tool result resolves.

Optional — sources that do not serve `ui://` resources need not implement
this method. `ai-mcp`'s `MCPClient` satisfies this structurally.

#### Parameters

##### uri

`string`

#### Returns

`Promise`\<`McpResourceReadResult`\>

***

### tools()

```ts
tools: (options?) => Promise<ServerTool<SchemaInput, SchemaInput, string, unknown>[]>;
```

Defined in: [packages/ai/src/activities/chat/mcp/types.ts:29](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/mcp/types.ts#L29)

#### Parameters

##### options?

###### lazy?

`boolean`

#### Returns

`Promise`\<[`ServerTool`](ServerTool.md)\<[`SchemaInput`](../type-aliases/SchemaInput.md), [`SchemaInput`](../type-aliases/SchemaInput.md), `string`, `unknown`\>[]\>

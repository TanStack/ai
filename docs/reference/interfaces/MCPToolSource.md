---
id: MCPToolSource
title: MCPToolSource
---

Defined in: [packages/ai/src/activities/chat/mcp/types.ts:59](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/mcp/types.ts#L59)

Minimal structural shape that `chat({ mcp })` needs from an MCP client.

`@tanstack/ai-mcp`'s `MCPClient` and `MCPClients` satisfy this interface by
shape — the core `@tanstack/ai` package does NOT import `@tanstack/ai-mcp`
(ai-mcp depends on ai, not the reverse).

## Properties

### close

```ts
close: () => Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/mcp/types.ts:73](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/mcp/types.ts#L73)

#### Returns

`Promise`\<`void`\>

***

### readResource?

```ts
optional readResource?: (uri, options?) => Promise<McpResourceReadResult>;
```

Defined in: [packages/ai/src/activities/chat/mcp/types.ts:84](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/mcp/types.ts#L84)

Reads an MCP resource by URI. Used by the chat manager to eagerly fetch
`ui://` resource widgets (MCP Apps) after a tool result resolves.

`options.serverId` is the server that owns the tool. `options.meta` is
the `_meta` to send with the read.

Optional — sources that do not serve `ui://` resources need not implement
this method. `ai-mcp`'s `MCPClient` satisfies this structurally.

#### Parameters

##### uri

`string`

##### options?

###### meta?

`Record`\<`string`, `unknown`\>

###### serverId?

`string`

#### Returns

`Promise`\<`McpResourceReadResult`\>

***

### tools

```ts
tools: (options?) => Promise<AnyServerTool[]>;
```

Defined in: [packages/ai/src/activities/chat/mcp/types.ts:68](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/mcp/types.ts#L68)

Lists the tools. `chat()` passes the run's `signal` so that a cancelled
run also cancels discovery. A source that ignores `signal` still works.
`chat()` passes `requestMeta` only when the caller set it.

#### Parameters

##### options?

###### lazy?

`boolean`

###### requestMeta?

[`MCPRequestMeta`](../type-aliases/MCPRequestMeta.md)

###### signal?

`AbortSignal`

#### Returns

`Promise`\<[`AnyServerTool`](../type-aliases/AnyServerTool.md)[]\>

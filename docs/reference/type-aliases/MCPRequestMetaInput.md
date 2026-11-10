---
id: MCPRequestMetaInput
title: MCPRequestMetaInput
---

```ts
type MCPRequestMetaInput = 
  | {
  args: Record<string, unknown>;
  method: "tools/call";
  serverId: string | undefined;
  toolName: string;
}
  | {
  method: "resources/read";
  serverId: string | undefined;
  uri: string;
};
```

Defined in: [packages/ai/src/activities/chat/mcp/types.ts:26](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/mcp/types.ts#L26)

The MCP request that an `MCPRequestMeta` hook is about to send.

- `tools/call`: `toolName` is the server name of the tool (no prefix).
- `resources/read`: `uri` is the resource that is read.

`serverId` is the client prefix, or `undefined` when the client has none.

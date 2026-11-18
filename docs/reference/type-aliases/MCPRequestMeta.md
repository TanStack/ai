---
id: MCPRequestMeta
title: MCPRequestMeta
---

```ts
type MCPRequestMeta = (request) => 
  | Record<string, unknown>
  | undefined
| Promise<Record<string, unknown> | undefined>;
```

Defined in: [packages/ai/src/activities/chat/mcp/types.ts:45](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/mcp/types.ts#L45)

Gives the `_meta` for one MCP request.

The hook runs once for each MCP request, when the request executes. Its
result is sent as the request `_meta`. Return `undefined` to send no
`_meta`. `@tanstack/ai-mcp` drops the keys that MCP reserves
(`progressToken` and the `io.modelcontextprotocol/` style prefixes).

If the hook throws or rejects, that one request fails with the error.

## Parameters

### request

[`MCPRequestMetaInput`](MCPRequestMetaInput.md)

## Returns

  \| `Record`\<`string`, `unknown`\>
  \| `undefined`
  \| `Promise`\<`Record`\<`string`, `unknown`\> \| `undefined`\>

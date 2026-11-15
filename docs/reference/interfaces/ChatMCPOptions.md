---
id: ChatMCPOptions
title: ChatMCPOptions
---

Defined in: [packages/ai/src/activities/chat/mcp/types.ts:104](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/mcp/types.ts#L104)

Options controlling MCP tool discovery and lifecycle for a `chat()` call.

## Properties

### clients

```ts
clients: MCPToolSource[];
```

Defined in: [packages/ai/src/activities/chat/mcp/types.ts:108](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/mcp/types.ts#L108)

The MCP clients or client pools to discover tools from and manage.

***

### connection?

```ts
optional connection?: MCPConnectionPolicy;
```

Defined in: [packages/ai/src/activities/chat/mcp/types.ts:115](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/mcp/types.ts#L115)

Connection lifecycle policy applied to all clients when the run ends.

Defaults to `'close'`.

***

### lazyTools?

```ts
optional lazyTools?: boolean;
```

Defined in: [packages/ai/src/activities/chat/mcp/types.ts:123](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/mcp/types.ts#L123)

When `true`, tool schemas are fetched lazily (forwarded to
`tools({ lazy: true })`).

Defaults to `false`.

***

### onDiscoveryError?

```ts
optional onDiscoveryError?: (error, source) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/mcp/types.ts:144](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/mcp/types.ts#L144)

Called when tool discovery fails for a single source.

- Throw (or re-throw) from this handler to fail the entire chat call fast.
- Return normally to skip that source and continue with remaining clients.
- Omit this handler entirely to rethrow the error (fail-fast by default).

Async handlers are awaited, so a rejected promise also fails fast.

#### Parameters

##### error

`unknown`

##### source

[`MCPToolSource`](MCPToolSource.md)

#### Returns

`void` \| `Promise`\<`void`\>

***

### requestMeta?

```ts
optional requestMeta?: MCPRequestMeta;
```

Defined in: [packages/ai/src/activities/chat/mcp/types.ts:133](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/mcp/types.ts#L133)

Gives the `_meta` for each MCP request in this chat run. It covers tool
calls and the MCP Apps `ui://` resource reads.

The hook runs when the request executes, not at discovery. Meta is not
part of the tool cache key: a `toolCacheMiddleware` hit sends no request,
so the hook does not run.

---
id: ChatMCPOptions
title: ChatMCPOptions
---

# Interface: ChatMCPOptions

Defined in: [packages/ai/src/activities/chat/mcp/types.ts:55](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/mcp/types.ts#L55)

Options controlling MCP tool discovery and lifecycle for a `chat()` call.

## Properties

### clients

```ts
clients: MCPToolSource[];
```

Defined in: [packages/ai/src/activities/chat/mcp/types.ts:59](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/mcp/types.ts#L59)

The MCP clients or client pools to discover tools from and manage.

***

### connection?

```ts
optional connection: MCPConnectionPolicy;
```

Defined in: [packages/ai/src/activities/chat/mcp/types.ts:66](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/mcp/types.ts#L66)

Connection lifecycle policy applied to all clients when the run ends.

Defaults to `'close'`.

***

### lazyTools?

```ts
optional lazyTools: boolean;
```

Defined in: [packages/ai/src/activities/chat/mcp/types.ts:74](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/mcp/types.ts#L74)

When `true`, tool schemas are fetched lazily (forwarded to
`tools({ lazy: true })`).

Defaults to `false`.

***

### onDiscoveryError()?

```ts
optional onDiscoveryError: (error, source) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/mcp/types.ts:85](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/mcp/types.ts#L85)

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

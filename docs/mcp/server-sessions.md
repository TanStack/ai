---
title: MCP Server Sessions
id: mcp-server-sessions
order: 13
description: "Route spec 2025 sessions to the instance that opened them, and learn when a session closes."
keywords:
  - tanstack ai
  - mcp
  - model context protocol
  - createMCPServer
  - sticky sessions
  - spec 2025
  - mcp-session-id
---

A spec 2025 client opens a session, then sends the same session id on each later request. On a deploy with more than one instance, a later request can reach an instance that did not open the session. That request gets 404.

Route each session to one instance. Use the `mcp-session-id` header as the key for sticky routing on your load balancer. If you cannot route by header, [serve spec 2025 without sessions](#serve-spec-2025-without-sessions).

## Where a session lives

A spec 2025 session keeps a live connection object. That object stays in the process that opened the session. Another process cannot read it.

- The client sends the session id on the `mcp-session-id` header.
- A request with an unknown session id gets 404 `Session not found`.
- A spec 2026 client sends no session id. Any instance can serve a spec 2026 request.

## When a session closes

A session closes in two cases:

- The client sends `DELETE` with its session id.
- The session gets no request for 30 minutes.

The server checks for idle sessions when a request comes in. After a session closes, the client must open a new session.

The server has no limit on the number of open sessions. Each session stays in memory until it closes, which can take 30 minutes. On a public server, set `auth`, or limit new sessions at your proxy.

## Serve spec 2025 without sessions

On Cloudflare Workers, and on other hosts with many instances, a request can reach any instance. Sticky routing by header is not always possible. Set `sessions` to `'stateless'`. A new server then answers each spec 2025 request, and no session is kept. A spec 2026 request works as before.

```ts
import { createMCPServer } from '@tanstack/ai-mcp/server'

const server = createMCPServer({
  name: 'weather',
  version: '1.0.0',
  sessions: 'stateless',
})
```

Without a session, the server cannot send a request back to a spec 2025 client. For that client:

- `ctx.context.requestInput` throws an error that names the `sessions` option.
- `ctx.context.sample` calls the `sample` option of the server. Without that option, it throws.

## Turn spec 2025 off

To serve spec 2026 only, set `sessions` to `'reject'`. A spec 2025 request then gets the SDK rejection. A client that speaks only spec 2025 cannot use that server.

```ts
import { createMCPServer } from '@tanstack/ai-mcp/server'

const server = createMCPServer({
  name: 'weather',
  version: '1.0.0',
  sessions: 'reject',
})
```

## Sessions and auth

When the server has `auth`, the session belongs to the caller that opened it: the `clientId` of the token plus its `sub` claim. A request from another caller gets 404, the same as an unknown id. [MCP Server Auth](./server-auth) shows how the verifier sets them.

A client on one instance opens a session, sends its requests, and gets its answers from that same instance.

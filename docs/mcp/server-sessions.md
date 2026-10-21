---
title: MCP Server Sessions
id: mcp-server-sessions
order: 13
description: "Choose how a createMCPServer server serves spec 2025 clients: with no session, with sessions for input and sampling, or not at all."
keywords:
  - tanstack ai
  - mcp
  - model context protocol
  - createMCPServer
  - sticky sessions
  - spec 2025
  - mcp-session-id
---

Some MCP clients speak only spec 2025. Spec 2025 can use sessions, and a session lives in one process. On a deploy with many instances, sessions need sticky routing.

The `sessions` option of `createMCPServer` sets how the server treats spec 2025 clients. By default, it keeps no session. Change it only for one of the cases below.

## Quick setup

Pick one value for `sessions`:

| Value | What you get | Use it when |
| --- | --- | --- |
| `'stateless'` (default) | No session. Any instance can answer any request. | You deploy to serverless or to many instances. |
| `'memory'` | Sessions in the process. The server can ask a spec 2025 client for input or a sample. | A tool calls `requestInput` or `sample` for spec 2025 clients. |
| `'reject'` | Spec 2026 only. | You do not want to serve spec 2025 clients. |

To keep sessions, set `sessions` to `'memory'`:

```ts
import { createMCPServer } from '@tanstack/ai-mcp/server'

const server = createMCPServer({
  name: 'weather',
  version: '1.0.0',
  sessions: 'memory',
})
```

Now a spec 2025 client opens a session, and a tool can ask that client for input or a sample.

## How it works

With the default `'stateless'` value, a new server answers each spec 2025 request, and no session stays in memory. A spec 2026 client sends no session id either, so any instance can serve both.

Without a session, the server cannot send a request back to a spec 2025 client. For that client:

- `ctx.context.requestInput` throws an error that names the `sessions` option.
- `ctx.context.sample` calls the `sample` option of the server. Without that option, it throws.

A spec 2026 client gets `requestInput` and `sample` with no session.

`serveMCPStdio` uses `'memory'` when you do not set `sessions`. A stdio process serves one client, so a session costs nothing there.

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

## Advanced

### Route each session to one instance

A spec 2025 session keeps a live connection object. That object stays in the process that opened the session. Another process cannot read it.

- The client sends the session id on the `mcp-session-id` header.
- A request with an unknown session id gets 404 `Session not found`.

On a deploy with more than one instance, a later request can reach an instance that did not open the session. That request gets 404. Use the `mcp-session-id` header as the key for sticky routing on your load balancer.

### When a session closes

A session closes in two cases:

- The client sends `DELETE` with its session id.
- The session gets no request for 30 minutes.

The server looks for idle sessions when a request comes in. After a session closes, the client must open a new session.

The server has no limit on the number of open sessions. Each session stays in memory until it closes, and that can take 30 minutes. On a public server, set `auth`, or limit new sessions at your proxy.

### Sessions and auth

When the server has `auth`, the session belongs to the caller that opened it: the `clientId` of the token plus its `sub` claim. A request from another caller gets 404, the same as an unknown id. [MCP Server Auth](./server-auth) shows how the verifier sets these values.

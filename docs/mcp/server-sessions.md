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

Route each session to one instance. Use the `mcp-session-id` header as the key for sticky routing on your load balancer.

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

## Sessions and auth

When `auth` names a subject, the session belongs to that subject. A request from another subject gets 404, the same as an unknown id. [MCP Server Auth](./server-auth) shows how to set the subject.

A client on one instance opens a session, sends its requests, and gets its answers from that same instance.

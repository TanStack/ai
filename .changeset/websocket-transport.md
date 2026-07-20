---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-svelte': minor
'@tanstack/ai-angular': minor
---

WebSocket transport: a full-duplex, resumable third transport alongside SSE and
NDJSON, reusing the same delivery-durability seam.

On the server, `@tanstack/ai` adds `toWebSocketStream(socket, request, { onRun,
durability, batch, heartbeatMs, idleTimeoutMs, debug })` — a portable core that
pumps a conversation over an already-accepted WHATWG `WebSocketLike` server
socket (Node via `ws`, Bun, etc.), and `toWebSocketResponse(request, { onRun,
… })`, a thin wrapper that upgrades via `WebSocketPair` and returns a 101
`Response` on Cloudflare Workers/Durable Objects (it throws elsewhere, pointing
you at `toWebSocketStream`). Because one socket outlives many `chat()` turns
(client-tool resubmits, follow-up user messages), you pass an `onRun(ctx) =>
AsyncIterable<StreamChunk>` factory instead of a prebuilt stream — the helper
calls it per inbound `RunAgentInput` frame. The socket is conversation-scoped:
it stays open across turns and closes on client close, an `{ type: 'abort',
runId }` control frame (which aborts only that turn), or the idle timeout, with a
periodic `{ type: 'ping' }` heartbeat. Durability is keyed per turn and reuses
the existing `durableStreamSource`, so server→client frames carry the same
`{ id, chunk }` envelope as NDJSON. `resumeWebSocketStream(socket, { adapter })`
and `resumeWebSocketResponse({ adapter })` replay a run read-only from the
durability log (no model call).

On the client, `webSocket(url, options)` (in `@tanstack/ai-client`, re-exported
from `@tanstack/ai-react`, `-solid`, `-vue`, `-svelte`, and `-angular`) is a
full-duplex `subscribe` + `send` connection adapter for `useChat`. `send()`
writes a `RunAgentInput` frame; `subscribe()` yields inbound chunks, ignores
heartbeats, unwraps durable envelopes, and auto-reconnects a dropped durable run
by reopening with `?runId=&offset=` (browsers can't set a `Last-Event-ID`
handshake header, so the offset rides in the URL). The reconnect bookkeeping
(offset de-dupe, no-progress ceiling → `StreamReconnectLimitError`) is shared
with the HTTP adapters via the new `createReconnectTracker`, and a fatal drop
surfaces to the consumer (`StreamReadError` / `StreamReconnectLimitError`)
instead of hanging.

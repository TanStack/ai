# Cap'n Web Group Chat

A real-time multi-user chat demonstrating **Cap'n Web RPC** bidirectional push with **TanStack Start**. Mention `@Claude` in a message to queue an Anthropic response (requires `ANTHROPIC_API_KEY`).

## Features

- Real-time messaging via Cap'n Web server→client push (no polling)
- Online presence updates when users join or leave
- Auto-connect on page load
- Optional `@Claude` AI responses via `@tanstack/ai`
- TanStack Start SSR shell + file-based routing
- Tailwind CSS chat UI

## Architecture

- **[Cap'n Web](https://github.com/cloudflare/capnweb)** — `RpcTarget` server + typed `RpcStub<ChatApi>` client over WebSocket
- **[TanStack Start](https://tanstack.com/start)** — Vite + Nitro 3 full-stack React
- **Vite dev plugin** — WebSocket upgrade at `/api/websocket` (Node `ws` pattern from Cap'n Web docs)

```
chat-server/
├── chat-api.ts        # Shared ChatApi interface and types
├── chat-logic.ts      # In-memory chat state
├── capnweb-rpc.ts     # ChatServer RpcTarget + push broadcasts
└── vite-plugin.ts     # Dev-server WebSocket upgrade handler

src/
├── hooks/
│   ├── useChatConnection.ts  # RpcStub session + Symbol.dispose
│   ├── useChatMessages.ts    # joinChat onNotify push handler
│   └── useClaude.ts          # Claude queue status
└── routes/index.tsx          # Main chat page
```

> **Note:** The Cap'n Web WebSocket room runs on the Vite dev server (`pnpm dev`). Production `pnpm build` / `pnpm serve` builds the Start app but does not host the live chat room — use `pnpm dev` to exercise real-time RPC.

## Getting Started

From the monorepo root:

```bash
pnpm install
cd examples/ts-group-chat
cp .env.example .env   # optional, for @Claude
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in multiple browser tabs, pick different usernames, and send messages.

## How It Works

1. Client opens `newWebSocketRpcSession<ChatApi>(url, chatNotifier)` — the notifier is exported as Cap'n Web `localMain`.
2. Server receives the client's notifier stub when the WebSocket session starts (`vite-plugin.ts`).
3. Client calls `joinChat(username)`; the server registers that connection's notifier for push.
4. When any user sends a message, `broadcastToAll` invokes each client's `notify()` stub — instant push, no polling.

```typescript
// Client: export ChatNotifier as localMain, call typed ChatApi methods
const notifier = new ChatNotifier()
notifier.onNotification = (n) => { /* update UI */ }
const api = newWebSocketRpcSession<ChatApi>(wsUrl, notifier)
await api.joinChat(username)

// Server (vite plugin): receive client notifier stub from session setup
const clientNotifier = newWebSocketRpcSession(ws, chatServer)
chatServer.setClientNotifier(clientNotifier)
```

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start dev server with Cap'n Web WebSocket (port 3000) |
| `pnpm build` | Build TanStack Start app |
| `pnpm serve` | Preview production build |
| `pnpm test:types` | Typecheck |

## @Claude Integration

Set `ANTHROPIC_API_KEY` in `.env`. Messages containing `@Claude` (or starting with `Claude`) queue a response from `claude-sonnet-4-5`. Only one Claude request runs at a time; others wait in queue.

## Key Technologies

- **Cap'n Web 0.10** — bidirectional RPC, pass-by-reference callbacks, `RpcStub` + `[Symbol.dispose]()`
- **TanStack Start 1.159** — `tanstackStart()` + Nitro 3
- **TanStack AI** — Anthropic adapter for Claude mentions

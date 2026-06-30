# @tanstack/ai-acp

Shared [Agent Client Protocol](https://agentclientprotocol.com) (ACP) plumbing for TanStack AI **harness adapters** — the code that turns a coding-agent CLI (`grok`, `gemini --acp`, …) into a `chat()` backend inside a sandbox.

Most apps should use a harness package directly (`@tanstack/ai-grok-build`, …). Reach for `@tanstack/ai-acp` when:

- you want to plug an ACP agent that **has no dedicated adapter package** into a sandbox — use [`acpCompatible`](#plug-in-any-acp-agent-acpcompatible) (the `openaiCompatible` of harnesses), or
- you are **building or extending** a harness adapter and need the transport, session, permission, and stream-translation layers in one place.

## Installation

```bash
npm install @tanstack/ai-acp @tanstack/ai @tanstack/ai-sandbox
```

Peer dependencies: `@tanstack/ai`, `@tanstack/ai-sandbox`. The package also depends on [`@agentclientprotocol/sdk`](https://www.npmjs.com/package/@agentclientprotocol/sdk) for the JSON-RPC client.

## What it does

Harness CLIs that support ACP expose a long-lived JSON-RPC session. They stream **session updates** (text chunks, tool calls, planning, permissions) while the orchestrator drives the turn with `prompt`. TanStack AI speaks **AG-UI `StreamChunk`s** (`RUN_STARTED`, `TEXT_MESSAGE_CONTENT`, `TOOL_CALL_*`, `RUN_FINISHED`, …).

`@tanstack/ai-acp` sits in the middle:

```
┌─────────────────┐     ACP JSON-RPC      ┌──────────────────┐
│  Harness CLI    │ ◄──────────────────► │  startAcpSession │
│  (in sandbox)   │   stdio or WebSocket │  (ClientSide)    │
└─────────────────┘                      └────────┬─────────┘
                                                  │ session updates
                                                  ▼
                                         ┌──────────────────┐
                                         │  AsyncQueue      │
                                         │  translateAcpStream │
                                         └────────┬─────────┘
                                                  │ StreamChunk
                                                  ▼
                                         ┌──────────────────┐
                                         │  chat() stream   │
                                         └──────────────────┘
```

Responsibilities split roughly as:

| Layer              | Module                   | Role                                                                       |
| ------------------ | ------------------------ | -------------------------------------------------------------------------- |
| **Transport**      | `transport/*`            | Bytes ↔ JSON-RPC: stdio (NDJSON) or WebSocket                              |
| **Session**        | `session/acp-client`     | `initialize` → `authenticate` → `newSession` / `loadSession` → `prompt`    |
| **Sandbox server** | `session/sandbox-server` | Boot an in-sandbox `serve` process and connect over an exposed port        |
| **Translation**    | `stream/translate`       | ACP `sessionUpdate` events → TanStack `StreamChunk`s                       |
| **Permissions**    | `permissions`            | Map harness permission prompts to allow/reject (and optional approval ids) |

## Plug in any ACP agent (`acpCompatible`)

`acpCompatible` is the **easy path**: it builds a `chat()` text adapter for any
ACP-compliant agent CLI without a dedicated package — the harness equivalent of
`openaiCompatible`. Configure the harness once, select a model per call, pass it
into a sandbox.

```typescript
import { acpCompatible } from '@tanstack/ai-acp'
import { chat } from '@tanstack/ai'
import { defineSandbox, withSandbox } from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

// Configure the "pi" agent harness once (it speaks ACP over stdio):
const pi = acpCompatible({
  name: 'pi',
  command: ({ model, harnessCwd }) => `pi --acp -m ${model} --cwd ${harnessCwd}`,
  authMethodId: 'pi-api-key', // when the harness advertises it
  refusalMessage: 'Pi refused the request.',
})

// Then drive it like any other adapter, inside a sandbox:
const stream = chat({
  adapter: pi('pi-fast'),
  messages: [{ role: 'user', content: 'Add a health check route and run the tests.' }],
  middleware: [
    withSandbox(
      defineSandbox({
        id: 'pi-demo',
        provider: dockerSandbox({ image: 'node:22' }),
        // …workspace: clone source, install the `pi` CLI, inject its API key
      }),
    ),
  ],
})
```

You get the full ACP flow for free: sandbox resolution, `chat()`-tool → MCP
bridging, session resume (via `modelOptions.sessionId`), permission modes,
abort, and AG-UI translation.

### Configuration

| Field | Purpose |
| ----- | ------- |
| `name` (required) | Provider label, log prefix, and the `<name>.session-id` CUSTOM event name. |
| `command` | Build the **stdio** launch command (`({ model, cwd, harnessCwd, sandbox, env, signal }) => string`). Required unless `openTransport` is given. |
| `openTransport` | Full transport escape hatch — open any `AcpSessionTransport` yourself (e.g. boot a `serve` process and connect over WebSocket). Overrides `command`. |
| `cwd` | Working directory inside the sandbox (default `/workspace`). |
| `env` | Extra environment variables for the harness process. |
| `authMethodId` | ACP auth method to select before the session starts. |
| `permissionMode` | `'default'` \| `'acceptEdits'` \| `'bypassPermissions'` (default). |
| `permissions` | `'headless'` (auto-resolve, default) or `'interactive'` (emit approval-requested events for `ask` prompts). |
| `onPermissionRequest` | Custom `PermissionHandler`; overrides `permissions`/`permissionMode`. |
| `refusalMessage` | `RUN_ERROR` message when the harness refuses. |
| `planEventName` | Emit ACP `plan` updates as a CUSTOM event under this name. |
| `emitDiff` | Emit the post-run `git diff` of `cwd` as a `file.changed` CUSTOM event (off by default). |
| `onExtNotification` | Handle vendor `_x/…` JSON-RPC notifications. |
| `buildPrompt` | Override how chat history maps to the harness prompt (defaults to `buildAcpPrompt`). |

For WebSocket/`serve` harnesses, return your own transport from `openTransport`
(see how `@tanstack/ai-grok-build` boots `grok agent serve` with
`startAcpServerInSandbox` + `connectAcpWebSocket`). Use `acpCompatibleText(model,
config)` for a one-shot single-model adapter.

## Quick start (building a harness adapter)

If `acpCompatible` doesn't fit (you need a typed provider-options surface, custom
structured output, vendor projections, …), build the adapter by hand. The
pattern every ACP harness adapter follows:

1. Spawn the CLI inside a sandbox (`withSandbox` middleware).
2. Open an ACP transport (stdio or WebSocket).
3. Call `startAcpSession` and wire `onUpdate` / `onPermissionRequest`.
4. Push events into an `AsyncQueue`, call `session.prompt`, then `translateAcpStream`.
5. Emit a **CUSTOM** session-id chunk so follow-up runs can `loadSession`.

```typescript
import { chat } from '@tanstack/ai'
import {
  AsyncQueue,
  resolveInteractivePermission,
  spawnHandleToAcpTransport,
  startAcpSession,
  translateAcpStream,
} from '@tanstack/ai-acp'
import { withSandbox } from '@tanstack/ai-sandbox'

// Inside your adapter's chatStream():
const proc = await sandbox.process.spawn('my-cli --acp -m auto', {
  cwd: '/workspace',
})

const queue = new AsyncQueue()
const session = await startAcpSession({
  transport: { kind: 'stdio', process: proc },
  cwd: '/workspace',
  authMethodId: 'gemini-api-key', // when the harness advertises it
  resumeSessionId: options.modelOptions?.sessionId,
  mcpServers: bridge
    ? [
        {
          name: bridge.name,
          url: bridge.url,
          headers: [{ name: 'Authorization', value: `Bearer ${bridge.token}` }],
        },
      ]
    : undefined,
  onUpdate: (update) => queue.push({ kind: 'update', update }),
  onPermissionRequest: (request) =>
    resolveInteractivePermission(
      request,
      'acceptEdits',
      bridgedToolNames,
      options.approvals,
      'my-harness',
    ).outcome,
})

queue.push({ kind: 'session', sessionId: session.sessionId })

session
  .prompt(userText)
  .then(({ stopReason, usage }) => {
    queue.push({
      kind: 'done',
      stopReason,
      ...(usage !== undefined && { usage }),
    })
    queue.end()
  })
  .catch((error) => queue.fail(error))

yield *
  translateAcpStream(queue, {
    model: 'auto',
    runId,
    threadId,
    genId: () => crypto.randomUUID(),
    labels: {
      sessionIdEvent: 'my-harness.session-id',
      planEvent: 'my-harness.plan',
      refusalMessage: 'Harness refused the request.',
    },
    bridgedToolNames,
  })
```

Wire the adapter into `chat()` with `withSandbox(...)` like any other harness package.

## Transports

ACP can run over **stdio** (newline-delimited JSON-RPC on the child process pipes) or **WebSocket** (harness runs a `serve` subcommand inside the sandbox; the orchestrator connects through an exposed port).

### Stdio

Use when the sandbox can write to process stdin (`capabilities.writableStdin === true`):

```typescript
import { spawnHandleToAcpTransport } from '@tanstack/ai-acp'

const proc = await sandbox.process.spawn('grok agent --acp -m auto', { cwd })
// spawnHandleToAcpTransport adapts SpawnHandle stdout/stdin for ndJsonStream
await startAcpSession({ transport: { kind: 'stdio', process: proc }, ... })
```

On providers without writable stdin (e.g. Cloudflare Containers), adapters feed the prompt via a shell redirect instead of a host stdin write — that workaround lives in each harness adapter, not in `@tanstack/ai-acp`.

### WebSocket

Use when stdin is not writable but the sandbox supports background processes and port exposure:

```typescript
import {
  buildGrokServeWebSocketUrl,
  resolveAcpTransportMode,
  startAcpServerInSandbox,
} from '@tanstack/ai-acp'

const mode = resolveAcpTransportMode(sandbox, 'auto') // 'stdio' | 'websocket'

const server = await startAcpServerInSandbox(sandbox, {
  port: 2419,
  cwd: '/workspace',
  command: 'grok agent -m composer-2.5 --always-approve serve --bind 0.0.0.0:2419 --secret …',
  buildWsUrl: ({ channel }) => buildGrokServeWebSocketUrl(channel.url, secret),
  readyMarker: 'WebSocket URL:',
  framing: 'frame',
})

const { stream, close } = await server.connect(signal)
await startAcpSession({
  transport: { kind: 'stream', stream, dispose: async () => { close(); await server.dispose() } },
  ...
})
```

`resolveAcpTransportMode(sandbox, preference)` implements the selection table:

| Preference         | Behavior                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| `'stdio'`          | Requires `writableStdin`; throws if unavailable                                                         |
| `'websocket'`      | Requires `ports` + `backgroundProcesses`                                                                |
| `'auto'` (default) | Prefer stdio when writable; else WebSocket when ports are available; else throw with a actionable error |

Helpers: `connectAcpWebSocket`, `httpChannelUrlToWsBase`, `webSocketFrameToAcpStream`, `parseWebSocketUrlFromServeOutput`.

## Session lifecycle

`startAcpSession` wraps `@agentclientprotocol/sdk`'s `ClientSideConnection`:

1. **`initialize`** — negotiate protocol version and read agent capabilities.
2. **`authenticate`** (optional) — when `authMethodId` is set and the harness advertises that method (e.g. `gemini-api-key`, `oauth-personal`).
3. **`loadSession` or `newSession`** — resume when `resumeSessionId` is provided and the agent supports `loadSession`; otherwise start fresh. MCP server descriptors (bridged TanStack tools) are attached here.
4. **`prompt`** — send the user turn; the harness streams updates via `sessionUpdate` callbacks until it returns `stopReason` + optional `usage`.
5. **`cancel` / `dispose`** — abort an in-flight turn or tear down the transport.

The returned `AcpSessionHandle` exposes `{ sessionId, resumed, prompt, cancel, dispose }`.

### Stateful sessions

On the first run, `translateAcpStream` emits a CUSTOM chunk:

```typescript
{ type: 'CUSTOM', name: 'my-harness.session-id', value: { sessionId: '…' } }
```

Thread that `sessionId` through `modelOptions.sessionId` on the next `chat()` call so `startAcpSession` can `loadSession` and only send the trailing user message.

## Stream translation

`translateAcpStream(events, ctx)` is a pure async generator. Feed it `AcpStreamEvent` values:

| Event                                  | When                                      |
| -------------------------------------- | ----------------------------------------- |
| `{ kind: 'session', sessionId }`       | Right after `newSession` / `loadSession`  |
| `{ kind: 'update', update }`           | Each `onUpdate` callback from the harness |
| `{ kind: 'done', stopReason, usage? }` | After `prompt` resolves                   |

ACP → AG-UI mapping (high level):

| ACP `sessionUpdate`                | StreamChunk(s)                            |
| ---------------------------------- | ----------------------------------------- |
| `agent_message_chunk`              | `TEXT_MESSAGE_*`                          |
| `agent_thought_chunk`              | `REASONING_*`                             |
| `tool_call` / `tool_call_update`   | `TOOL_CALL_*` + `TOOL_CALL_RESULT`        |
| `plan`                             | `CUSTOM` (when `labels.planEvent` is set) |
| (terminal) `stopReason: 'refusal'` | `RUN_ERROR`                               |
| (terminal) other stop reasons      | `RUN_FINISHED` + usage                    |

`matchBridgedToolName` rewrites tool titles from the harness MCP namespace back to TanStack tool names when host tools are bridged in. `BRIDGED_MCP_SERVER_NAME` (`'tanstack'`) is the conventional MCP server name adapters use for the bridge.

`AsyncQueue` bridges callback-style `onUpdate` notifications into the async-iterable world `translateAcpStream` consumes.

## Permissions

Harnesses can pause mid-turn and ask the client to approve a tool call. Wire `onPermissionRequest` on `startAcpSession`:

```typescript
import {
  resolvePermission,
  resolveInteractivePermission,
} from '@tanstack/ai-acp'

// Headless / sandboxed: auto-approve bridged tools + edits, reject everything else
onPermissionRequest: (request) =>
  resolvePermission(request, permissionMode, bridgedToolNames)

// Interactive: same policy, but emit approval-requested events for 'ask' actions
const { outcome, approvalId } = resolveInteractivePermission(
  request,
  permissionMode,
  bridgedToolNames,
  options.approvals,
  'my-harness',
)
```

`AcpPermissionMode`:

| Mode                  | Behavior                                                        |
| --------------------- | --------------------------------------------------------------- |
| `'default'`           | Approve TanStack-bridged tools; reject other permission prompts |
| `'acceptEdits'`       | Also auto-approve file mutations (`edit`, `move`, `delete`)     |
| `'bypassPermissions'` | Approve everything                                              |

Pass a custom `PermissionHandler` to override the policy entirely.

## Public API

### Harness adapter

- `acpCompatible(config)` → `(model, overrides?) => AcpCompatibleTextAdapter`
- `acpCompatibleText(model, config)` → `AcpCompatibleTextAdapter`
- `buildAcpPrompt(messages, sessionId, harnessName?)` → `{ prompt, resume? }`
- `AcpCompatibleConfig`, `AcpCompatibleProviderOptions`, `AcpHarnessContext`, `BuiltAcpPrompt`

### Session

- `startAcpSession(options)` → `AcpSessionHandle`
- `StartAcpSessionOptions`, `AcpSessionHandle`

### Translation

- `translateAcpStream(events, ctx)` → `AsyncIterable<StreamChunk>`
- `AsyncQueue<T>`
- `matchBridgedToolName`, `BRIDGED_MCP_SERVER_NAME`
- `AcpStreamEvent`, `TranslateContext`, `AcpTranslateLabels`

### Transport

- `spawnHandleToAcpTransport(handle)` — stdio byte streams from a `SpawnHandle`
- `resolveAcpTransportMode(sandbox, preference?)`
- `connectAcpWebSocket(url, options?)`, `httpChannelUrlToWsBase`
- `webSocketFrameToAcpStream(ws)`

### In-sandbox server

- `startAcpServerInSandbox(sandbox, options)` → `AcpSandboxServer`
- `buildGrokServeWebSocketUrl(channelUrl, secret)`
- `parseWebSocketUrlFromServeOutput(stdout)`

### Permissions

- `resolvePermission`, `resolveInteractivePermission`
- `AcpPermissionMode`, `PermissionHandler`, `AcpPermissionRequest`, `AcpPermissionOutcome`

### Types

Structural subsets of ACP shapes (`AcpSessionUpdate`, `AcpToolCallUpdate`, `AcpUsage`, …) live in `types/acp-types.ts` so the translator stays fixture-testable without pulling the full SDK surface into every consumer.

## Consumers in this repo

| Package                   | How it uses `@tanstack/ai-acp`                                            |
| ------------------------- | ------------------------------------------------------------------------- |
| `@tanstack/ai-grok-build` | Stdio + WebSocket (`grok agent serve`); vendor `extNotification` handling |

Harness adapters re-export commonly needed symbols (`startAcpSession`, `translateAcpStream`, permission helpers) from their own entry points so app code rarely imports `@tanstack/ai-acp` directly.

## Further reading

- [Agent Client Protocol](https://agentclientprotocol.com)
- TanStack harness adapters: `@tanstack/ai-grok-build`
- Sandbox layer: `@tanstack/ai-sandbox` ([README](../ai-sandbox/README.md))

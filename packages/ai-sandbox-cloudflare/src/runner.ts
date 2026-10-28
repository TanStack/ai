/**
 * `runInContainerHarness` — the IN-CONTAINER harness runner, shipped from the
 * package so a co-located app's container program is a single function call.
 *
 * This is the heart of the CO-LOCATED model: the agent harness loop AND its MCP
 * tool-bridge run HERE, on the container's own localhost. The Durable Object
 * outside never calls `chat()`; it POSTs `/run` to this server and reads the
 * NDJSON stream back.
 *
 *   DO  ── POST /run {messages, harness, model, workspace, toolDescriptors,
 *                     toolExecUrl, toolExecToken} ──▶  THIS
 *   THIS ── NDJSON stream of StreamChunk ──────────────────────────────────▶  DO
 *
 * It is a tiny `node:http` server (NODE/container side — NOT Workers; it uses
 * `localProcessSandbox`). On `POST /run` it validates the {@link
 * ContainerRunRequest}, builds `chat()` with the in-container `local-process`
 * sandbox and the adapter the CALLER resolves, and streams each {@link
 * StreamChunk} back as NDJSON (one JSON object per line).
 *
 * Why the MCP bridge is genuinely in-container: the in-container sandbox is
 * `localProcessSandbox()` — the container IS the host — so the harness adapter
 * serves its tool-bridge over the container's own `localhost` and feeds the
 * prompt over NATIVE writable stdin (no file-redirect; the bridge URL/token
 * never leave the container). The MCP protocol never crosses the network.
 *
 * The ONE thing that still crosses back to the DO is host-tool EXECUTION: each
 * tool rebuilt by {@link remoteToolStubs} delegates its `execute()` to {@link
 * httpRemoteToolExecutor}, which POSTs `{ name, args }` (bearer-gated) to the
 * DO's `toolExecUrl`:
 *
 *   agent → in-container MCP bridge → stub.execute → httpRemoteToolExecutor → DO
 *
 * The app supplies only `resolveAdapter` — which `*Text` adapter to build for a
 * given `{ harness, model }`. The server + `chat()` wiring lives here, so the
 * package doesn't depend on every adapter package.
 *
 * NOTE: container-side Node code — compiles against the real TanStack AI types;
 * not runtime-verified in this repo (no container build in CI).
 */
import { createServer } from 'node:http'
import { EventType, chat } from '@tanstack/ai'
import {
  createSecrets,
  defineSandbox,
  defineWorkspace,
  httpRemoteToolExecutor,
  remoteToolStubs,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import { parseContainerRunRequest } from './protocol'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'
import type { WorkspaceDefinition } from '@tanstack/ai-sandbox'
import type { ContainerRunRequest, HarnessId } from './protocol'

/** The `{ harness, model }` the caller maps to a concrete `*Text` adapter. */
export interface ResolveAdapterInput {
  harness: HarnessId
  model: string
}

/** Options for {@link runInContainerHarness}. */
export interface RunInContainerHarnessOptions {
  /**
   * Build the text adapter `chat()` runs for one request's `{ harness, model }`.
   * The app supplies this so the package doesn't depend on every adapter package
   * — e.g. `({ model }) => claudeCodeText(model)`.
   */
  resolveAdapter: (input: ResolveAdapterInput) => AnyTextAdapter
  /** Port to listen on. Defaults to `RUNNER_PORT` env, then `8080`. */
  port?: number
}

/** What {@link runInContainerHarness} returns: the listening `node:http` server. */
export interface ContainerHarnessServer {
  /** The underlying `node:http` server (already `listen()`ing). */
  server: Server
  /** The port it is listening on. */
  port: number
}

/** Read a request body fully into a string (small JSON payloads only). */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => {
      body += chunk
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

/**
 * Rebuild the request's workspace with a real `createSecrets`, pulling each
 * referenced secret's VALUE from the container env. Secret values never cross
 * the `POST /run` boundary (`createSecrets` stores them under a non-enumerable
 * symbol, so serializing the workspace carries only the names) — the DO injects
 * them into the container env via `sandbox.setEnvVars`, and we reconstitute them
 * here. A referenced secret missing from the env is a hard error, never a silent
 * keyless run.
 */
function reconstituteWorkspace(
  workspace: WorkspaceDefinition,
): WorkspaceDefinition {
  if (workspace.secrets === undefined) return workspace
  const names = Object.keys(workspace.secrets)
  if (names.length === 0) return workspace
  const values: Record<string, string> = {}
  for (const name of names) {
    const value = process.env[name]
    if (value === undefined || value === '') {
      throw new Error(
        `runInContainerHarness: secret "${name}" is not set in the container env`,
      )
    }
    values[name] = value
  }
  return defineWorkspace({ ...workspace, secrets: createSecrets(values) })
}

/**
 * Build the `chat()` stream that runs the harness on THIS container via the
 * `local-process` sandbox. The agent's `chat()` tools are stubs that delegate
 * back to the DO; everything else (the harness loop, the MCP bridge, stdin)
 * stays on localhost.
 */
function runAgent(
  request: ContainerRunRequest,
  resolveAdapter: (input: ResolveAdapterInput) => AnyTextAdapter,
): AsyncIterable<StreamChunk> {
  const sandbox = defineSandbox({
    // The container IS the host: no isolation, just run on its own filesystem.
    id: 'colocated-in-container',
    provider: localProcessSandbox(),
    // Honor the app's workspace (source / setup / skills / …), with the secrets
    // re-resolved from the container env.
    workspace: reconstituteWorkspace(request.workspace),
  })

  // `stream: true` (no outputSchema) makes chat() return AsyncIterable<StreamChunk>.
  return chat({
    threadId: request.threadId,
    adapter: resolveAdapter({
      harness: request.harness,
      model: request.model,
    }),
    messages: request.messages,
    stream: true,
    // Rebuild the DO's host tools as stubs whose execute() POSTs back to the DO.
    // The adapter bridges them over the in-container localhost MCP transport.
    tools: remoteToolStubs(
      request.toolDescriptors,
      httpRemoteToolExecutor(request.toolExecUrl, request.toolExecToken),
    ),
    // Provide the in-container local-process sandbox handle the adapter needs.
    middleware: [withSandbox(sandbox)],
  })
}

/** Stream the agent's chunks to the response as NDJSON, one object per line. */
async function handleRun(
  req: IncomingMessage,
  res: ServerResponse,
  resolveAdapter: (input: ResolveAdapterInput) => AnyTextAdapter,
): Promise<void> {
  const parsed: unknown = JSON.parse(await readBody(req))
  const request = parseContainerRunRequest(parsed)
  res.writeHead(200, {
    'content-type': 'application/x-ndjson',
    'cache-control': 'no-cache',
  })
  // The DO appends each line to its durable run-log; here we are the producer,
  // so we surface a mid-stream failure as a terminal RUN_ERROR line the DO will
  // append + finish on, never a silently truncated stream.
  try {
    for await (const chunk of runAgent(request, resolveAdapter)) {
      res.write(`${JSON.stringify(chunk)}\n`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.write(`${JSON.stringify({ type: EventType.RUN_ERROR, message })}\n`)
  } finally {
    res.end()
  }
}

/**
 * Start the in-container harness runner: a `node:http` server with `GET /health`
 * and `POST /run`. Call this as the container's program; the app supplies only
 * `resolveAdapter`.
 */
export function runInContainerHarness(
  options: RunInContainerHarnessOptions,
): ContainerHarnessServer {
  const port =
    options.port ?? Number.parseInt(process.env.RUNNER_PORT ?? '8080', 10)

  const server = createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/run') {
      handleRun(req, res, options.resolveAdapter).catch((error: unknown) => {
        // A failure BEFORE we start streaming (e.g. a malformed body) is a 400 —
        // surfaced, never swallowed.
        const message = error instanceof Error ? error.message : String(error)
        if (!res.headersSent) {
          res.writeHead(400, { 'content-type': 'text/plain' })
        }
        res.end(message)
      })
      return
    }
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200).end('ok')
      return
    }
    res.writeHead(404).end('not found')
  })

  server.listen(port, () => {
    console.log(`[container-runner] listening on :${port}`)
  })

  return { server, port }
}

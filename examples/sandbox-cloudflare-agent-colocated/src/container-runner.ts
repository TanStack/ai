/**
 * The IN-CONTAINER harness runner — the program bundled INTO the container
 * image and started as the container's job (see Dockerfile). This is the heart
 * of the CO-LOCATED model: the agent harness loop AND its MCP tool-bridge run
 * HERE, on the container's own localhost. The Durable Object outside never
 * calls `chat()`; it just tells this runner to.
 *
 * It is a tiny `node:http` server. On `POST /run` it runs `chat()` with the
 * in-container `local-process` sandbox and the Claude Code adapter, then streams
 * every {@link StreamChunk} back to the DO as NDJSON (one JSON object per line).
 *
 *   DO  ── POST /run {messages, toolDescriptors, toolExecUrl, toolExecToken} ──▶  THIS
 *   THIS ── NDJSON stream of StreamChunk ───────────────────────────────────────▶  DO
 *
 * Why the MCP bridge is genuinely in-container here (vs the DO-drives-container
 * example): the in-container sandbox is `localProcessSandbox()` — the container
 * IS the host — so the Claude Code adapter serves its tool-bridge over the
 * container's own `localhost` via the default `node:http` host transport, and
 * it feeds the prompt to the `claude` CLI over NATIVE writable stdin (local
 * processes have a writable stdin; no file-redirect, and the bridge URL/token
 * never leave the container). The MCP protocol never crosses the network.
 *
 * The ONE thing that still must cross back to the DO is host-tool EXECUTION:
 * each tool rebuilt by {@link remoteToolStubs} delegates its `execute()` to
 * {@link httpRemoteToolExecutor}, which POSTs `{ name, args }` (bearer-gated) to
 * the DO's `toolExecUrl`. So the agent's tool call flows:
 *
 *   agent → in-container MCP bridge → stub.execute → httpRemoteToolExecutor → DO
 *
 * NOTE: compile-only reference — not runtime-verified here (no container build
 * in this repo's CI). It compiles against the real TanStack AI types.
 */
import { createServer } from 'node:http'
import { EventType, chat } from '@tanstack/ai'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import {
  createSecrets,
  defineSandbox,
  defineWorkspace,
  httpRemoteToolExecutor,
  remoteToolStubs,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import { parseRunRequest } from './protocol'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { StreamChunk } from '@tanstack/ai'
import type { RunRequest } from './protocol'

/** Port the runner listens on; the DO reaches it via the sandbox port mapping. */
const RUNNER_PORT = Number.parseInt(process.env.RUNNER_PORT ?? '8080', 10)

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
 * Build the `chat()` stream that runs Claude Code on THIS container via the
 * `local-process` sandbox. The agent's `chat()` tools are stubs that delegate
 * back to the DO; everything else (the harness loop, the MCP bridge, stdin)
 * stays on localhost.
 */
function runAgent(request: RunRequest): AsyncIterable<StreamChunk> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) {
    // Surface the misconfiguration instead of silently running keyless: the DO
    // injects this via sandbox.setEnvVars before starting the runner.
    throw new Error('container-runner: ANTHROPIC_API_KEY is not set in the container env')
  }
  const sandbox = defineSandbox({
    // The container IS the host: no isolation, just run on its own filesystem.
    id: 'colocated-in-container',
    provider: localProcessSandbox(),
    workspace: defineWorkspace({
      // The image ships `node` + the `claude` CLI; no source to clone.
      source: { type: 'none' },
      // ANTHROPIC_API_KEY is injected into the container env (see Dockerfile /
      // wrangler container env); the adapter forwards it to the `claude` CLI.
      secrets: createSecrets({ ANTHROPIC_API_KEY: anthropicKey }),
    }),
  })

  // `stream: true` (no outputSchema) makes chat() return AsyncIterable<StreamChunk>.
  return chat({
    threadId: request.threadId,
    adapter: claudeCodeText('sonnet'),
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
async function handleRun(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const request = parseRunRequest(JSON.parse(await readBody(req)))
  res.writeHead(200, {
    'content-type': 'application/x-ndjson',
    'cache-control': 'no-cache',
  })
  // pipeToRunLog lives on the DO side; here we are the producer, so we surface a
  // stream failure as a terminal RUN_ERROR line the DO will append + finish on.
  try {
    for await (const chunk of runAgent(request)) {
      res.write(`${JSON.stringify(chunk)}\n`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.write(`${JSON.stringify({ type: EventType.RUN_ERROR, message })}\n`)
  } finally {
    res.end()
  }
}

const server = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/run') {
    handleRun(req, res).catch((error: unknown) => {
      // A failure BEFORE we start streaming (e.g. a malformed body) is a 400 —
      // surfaced, never swallowed.
      const message = error instanceof Error ? error.message : String(error)
      if (!res.headersSent) res.writeHead(400, { 'content-type': 'text/plain' })
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

server.listen(RUNNER_PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[container-runner] listening on :${RUNNER_PORT}`)
})

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

function reconstituteWorkspace(
  workspace: WorkspaceDefinition,
): WorkspaceDefinition {
  if (workspace.secrets === undefined) return workspace
  const names = Object.keys(workspace.secrets)
  if (names.length === 0) return workspace
  const values: Record<string, string> = {}
  for (const name of names) {
    const value = process.env[name]
    const isMissingSecret = value === undefined || value === ''
    if (isMissingSecret) {
      throw new Error(
        `runInContainerHarness: secret "${name}" is not set in the container env`,
      )
    }
    values[name] = value
  }
  return defineWorkspace({ ...workspace, secrets: createSecrets(values) })
}

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
  try {
    const chunks = runAgent(request, resolveAdapter)
    for await (const chunk of chunks) {
      res.write(`${JSON.stringify(chunk)}\n`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.write(`${JSON.stringify({ type: EventType.RUN_ERROR, message })}\n`)
  } finally {
    res.end()
  }
}

export function runInContainerHarness(
  options: RunInContainerHarnessOptions,
): ContainerHarnessServer {
  const port =
    options.port ?? Number.parseInt(process.env.RUNNER_PORT ?? '8080', 10)

  const server = createServer((req, res) => {
    const isRunRequest = req.method === 'POST' && req.url === '/run'
    if (isRunRequest) {
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
    const isHealthRequest = req.method === 'GET' && req.url === '/health'
    if (isHealthRequest) {
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

/**
 * The entry Worker — a STATELESS trigger + router. It never drives a run; it
 * forwards to the {@link RunCoordinator} Durable Object and returns immediately.
 *
 * Routes:
 *   POST /runs              → coordinator.startRun(...) → `202 { runId }` (the
 *                             Worker invocation ENDS here; it does NOT wait for
 *                             the agent run — that is the whole point).
 *   GET  /runs/:id          → coordinator.status(...)   → run record (poll fallback).
 *   GET  /runs/:id/stream   → upgrade to WebSocket, hand the socket to the DO
 *                             (hibernatable tail with a resumable cursor).
 *   *    /_bridge/:runId     → forward to the DO, which serves the MCP tool-bridge
 *                             from its own fetch handler (no node:http listener).
 *
 * A run is addressed by a DO id derived from its `threadId`, so every event for
 * a conversation lands in one coordinator and the sandbox is reused per thread.
 *
 * NOTE: compile-only reference — not runtime-verified in this repo (no Workers
 * runtime here). See the README Limitations section.
 */
import { proxyToSandbox } from '@cloudflare/sandbox'
import type { ModelMessage } from '@tanstack/ai'
import type { Env, RunCoordinator, StartRunInput } from './coordinator'

export { RunCoordinator } from './coordinator'
// Re-export the Sandbox DO class so wrangler can bind the namespace.
export { Sandbox } from '@cloudflare/sandbox'

/** Body of `POST /runs`. */
interface CreateRunBody {
  threadId: string
  messages: Array<ModelMessage>
}

/** Narrow the parsed JSON body without casting (project rule: no `as`). */
function parseCreateRunBody(value: unknown): CreateRunBody {
  if (value === null || typeof value !== 'object') {
    throw new Error('body must be a JSON object')
  }
  if (
    !('threadId' in value) ||
    typeof value.threadId !== 'string' ||
    value.threadId === ''
  ) {
    throw new Error('body.threadId must be a non-empty string')
  }
  if (
    !('messages' in value) ||
    !Array.isArray(value.messages) ||
    value.messages.length === 0
  ) {
    throw new Error('body.messages must be a non-empty array')
  }
  // The chat engine validates message shape; we only assert it is an array of
  // objects here so the request fails fast with a clear 400 on garbage input.
  for (const message of value.messages) {
    if (message === null || typeof message !== 'object') {
      throw new Error('each message must be an object')
    }
  }
  return { threadId: value.threadId, messages: value.messages }
}

/** Resolve the coordinator DO that owns a thread's runs. */
function coordinatorFor(
  env: Env,
  threadId: string,
): DurableObjectStub<RunCoordinator> {
  return env.RUN_COORDINATOR.get(env.RUN_COORDINATOR.idFromName(threadId))
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Preview-port traffic for exposed sandbox ports is routed by hostname; let
    // the sandbox runtime claim those requests before our app routes run.
    const proxied = await proxyToSandbox(request, env)
    if (proxied) return proxied

    const url = new URL(request.url)
    const parts = url.pathname.split('/').filter(Boolean)

    // POST /runs — trigger a run, return 202 immediately.
    if (
      request.method === 'POST' &&
      parts.length === 1 &&
      parts[0] === 'runs'
    ) {
      let body: CreateRunBody
      try {
        body = parseCreateRunBody(await request.json())
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return jsonResponse({ error: message }, 400)
      }
      const runId = crypto.randomUUID()
      const input: StartRunInput = {
        runId,
        threadId: body.threadId,
        messages: body.messages,
      }
      // RPC into the coordinator. `startRun` registers the run and returns
      // immediately under `ctx.waitUntil`; we do NOT await the agent loop.
      await coordinatorFor(env, body.threadId).startRun(input)
      return jsonResponse({ runId }, 202)
    }

    // /runs/:id ... — everything else for a run needs the owning coordinator.
    // The thread id is carried in the query string so the Worker can address
    // the right DO without reading run state itself.
    if (parts[0] === 'runs' && typeof parts[1] === 'string') {
      const threadId = url.searchParams.get('threadId')
      if (threadId === null) {
        return jsonResponse({ error: 'threadId query param required' }, 400)
      }
      const coordinator = coordinatorFor(env, threadId)

      // GET /runs/:id/stream — hand the WebSocket upgrade to the DO.
      if (parts[2] === 'stream') {
        return coordinator.fetch(request)
      }
      // GET /runs/:id — status poll fallback.
      if (parts.length === 2 && request.method === 'GET') {
        const record = await coordinator.status(parts[1])
        if (!record) return jsonResponse({ error: 'unknown run' }, 404)
        return jsonResponse(record)
      }
    }

    // /_bridge/:runId — the in-sandbox agent's MCP calls. The token in the
    // Authorization header gates it; we route by the threadId query the bridge
    // URL is built with. (The DO performs the constant-time token check.)
    if (parts[0] === '_bridge' && typeof parts[1] === 'string') {
      const threadId = url.searchParams.get('threadId')
      if (threadId === null) {
        return new Response('threadId query param required', { status: 400 })
      }
      return coordinatorFor(env, threadId).fetch(request)
    }

    return new Response('not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>

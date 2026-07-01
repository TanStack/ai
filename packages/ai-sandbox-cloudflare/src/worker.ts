/**
 * `createSandboxAgentWorker` — the STATELESS trigger + router Worker for the
 * serverless/edge agent run model, factored so an app never writes it by hand.
 *
 * It never drives a run; it forwards to the owning {@link SandboxCoordinator}
 * Durable Object and returns immediately:
 *
 *   POST /runs              → coordinator.startRun(...) → `202 { runId }` (the
 *                             Worker invocation ENDS here; it does NOT wait for
 *                             the agent run — that is the whole point).
 *   * (with ?threadId)      → forward to coordinator.fetch(request), which the
 *                             base handles for `/runs/:id`, `/runs/:id/stream`,
 *                             and a subclass handles for `/_bridge`/`/tool-exec`.
 *
 * The coordinator that owns a thread's runs is resolved by the caller-supplied
 * `resolveCoordinator(env, threadId)` — usually a DO addressed by `threadId`, so
 * every event for a conversation lands in one coordinator and the sandbox is
 * reused per thread. {@link createCloudflareSandboxAgent} supplies a resolver
 * that uses the `RUN_COORDINATOR` binding.
 *
 * NOTE: Workers-runtime code — compiles against the real Cloudflare + TanStack
 * AI types; not runtime-verified in this repo (no Workers runtime here).
 */
import { proxyToSandbox } from '@cloudflare/sandbox'
import type { SandboxCoordinator, StartRunInput } from './coordinator'
import type { ModelMessage } from '@tanstack/ai'
import type { Sandbox } from '@cloudflare/sandbox'

/** Resolve the coordinator DO that owns a thread's runs. */
export type ResolveCoordinator<TEnv> = (
  env: TEnv,
  threadId: string,
) => DurableObjectStub<SandboxCoordinator<TEnv>>

/** Body of `POST /runs`. */
interface CreateRunBody {
  threadId: string
  messages: Array<ModelMessage>
  /** Forwarded verbatim to the app's resolvers — see {@link StartRunInput.metadata}. */
  metadata?: Record<string, unknown>
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
  // Optional free-form pass-through (app-validated). Must be an object if present.
  let metadata: Record<string, unknown> | undefined
  if ('metadata' in value && value.metadata !== undefined) {
    if (!isRecord(value.metadata)) {
      throw new Error('body.metadata must be an object')
    }
    metadata = value.metadata
  }
  return { threadId: value.threadId, messages: value.messages, metadata }
}

/** A JSON object — narrows `unknown` to `Record<string, unknown>` cast-free. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** A Worker env that carries the Sandbox DO namespace `proxyToSandbox` needs. */
interface SandboxBindingEnv {
  Sandbox: DurableObjectNamespace<Sandbox>
}

/** Narrow an env to one with a Sandbox binding (so previews can be proxied). */
function hasSandboxBinding<TEnv>(env: TEnv): env is TEnv & SandboxBindingEnv {
  return (
    env !== null &&
    typeof env === 'object' &&
    'Sandbox' in env &&
    env.Sandbox !== undefined
  )
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * Build the Worker fetch handler. `resolveCoordinator` maps `(env, threadId)` to
 * the DO stub that owns that thread's runs.
 */
export function createSandboxAgentWorker<TEnv>(
  resolveCoordinator: ResolveCoordinator<TEnv>,
): ExportedHandler<TEnv> {
  return {
    async fetch(request: Request, env: TEnv): Promise<Response> {
      // Preview-port traffic for exposed sandbox ports is routed by hostname; let
      // the sandbox runtime claim those requests before our app routes run. Only
      // possible when the env actually carries the Sandbox binding.
      if (hasSandboxBinding(env)) {
        const proxied = await proxyToSandbox(request, env)
        if (proxied) return proxied
      }

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
          // The host this request arrived on. Coordinators derive the container's
          // callback hosts from it when `PUBLIC_HOSTNAME`/`PREVIEW_HOSTNAME` are
          // unset. On Cloudflare this is safe to trust — the edge only routes
          // hostnames you own to your Worker. See `resolveBridgeOrigin` /
          // `resolvePreviewHost`.
          publicHost: url.host,
          // Forwarded verbatim to the app's resolvers (e.g. the chosen harness).
          metadata: body.metadata,
        }
        // RPC into the coordinator. `startRun` registers the run and returns
        // immediately under `ctx.waitUntil`; we do NOT await the agent loop.
        await resolveCoordinator(env, body.threadId).startRun(input)
        return jsonResponse({ runId }, 202)
      }

      // Everything else for a run needs the owning coordinator, addressed by the
      // `threadId` query the Worker carries so it never reads run state itself.
      // The base coordinator routes `/runs/:id` + `/runs/:id/stream`, and a
      // subclass routes `/_bridge/:runId` (DO-drives) or `/tool-exec/:runId`
      // (co-located) — all reachable through one forward.
      const threadId = url.searchParams.get('threadId')
      if (threadId !== null) {
        return resolveCoordinator(env, threadId).fetch(request)
      }

      return jsonResponse({ error: 'threadId query param required' }, 400)
    },
  }
}

import { validateReconstructGenerationStores } from './types'
import type { AIPersistence, GenerationRunRecord } from './types'

/**
 * The JSON body `reconstructGeneration` returns and a server-authoritative
 * client hydrates from on mount.
 *
 * `resumeSnapshot` mirrors the last generation run for the requested thread (or
 * a specific run id): its terminal/running `status`, the `result` metadata and
 * `error` it recorded, the `activity` it ran, and a `resumeState` cursor
 * (present only while the run is still `running`) the client can use to tail the
 * live generation. `null` when there is no matching run.
 *
 * `activeRun` is `{ runId }` when the resolved run is still `running`, else
 * `null` — the parallel of {@link ReconstructedChat.activeRun}.
 */
export interface ReconstructedGeneration {
  resumeSnapshot: {
    schemaVersion: 1
    resumeState: { threadId: string; runId: string } | null
    status: 'idle' | 'running' | 'complete' | 'error'
    result?: unknown
    error?: { message: string; code?: string }
    activity?: string
  } | null
  activeRun: { runId: string } | null
}

export interface ReconstructGenerationOptions {
  /** Query parameter carrying the thread id. Defaults to `threadId`. */
  param?: string
  /** Query parameter carrying the run id. Defaults to `runId`. */
  runParam?: string
  /**
   * Authorize access to the requested generation before loading it.
   *
   * ⚠️ Without this, any caller who knows or guesses `?threadId=` / `?runId=`
   * receives the generation's status and result metadata. Multi-user /
   * multi-tenant deployments **must** supply an authorization check (session →
   * owned thread/run) or resolve a validated id in the route.
   *
   * Called with whichever id was supplied — the `runId` when present, else the
   * `threadId`. Return:
   * - `true` to allow the load
   * - `false` for a default `403` response
   * - a `Response` to return as-is (e.g. `401` with a body)
   */
  authorize?: (
    id: string,
    request: Request,
  ) => boolean | Response | Promise<boolean | Response>
}

/**
 * Map the persisted run status to the client-facing resume-snapshot status.
 * An `interrupted` or `aborted` run surfaces as `error` — the client has no live
 * run to resume, and neither produced a usable result. (A generation abort is
 * always terminal: there is no journal to reattach to, so `withGenerationPersistence`
 * writes `'aborted'` rather than parking the run.)
 */
function snapshotStatus(
  status: GenerationRunRecord['status'],
): 'running' | 'complete' | 'error' {
  switch (status) {
    case 'running':
      return 'running'
    case 'completed':
      return 'complete'
    case 'failed':
    case 'interrupted':
    case 'aborted':
      return 'error'
  }
}

function runToSnapshot(
  run: GenerationRunRecord,
): NonNullable<ReconstructedGeneration['resumeSnapshot']> {
  const status = snapshotStatus(run.status)
  return {
    schemaVersion: 1,
    resumeState:
      status === 'running'
        ? { runId: run.runId, threadId: run.threadId }
        : null,
    status,
    ...(run.result !== undefined ? { result: run.result } : {}),
    ...(run.error !== undefined ? { error: run.error } : {}),
    ...(run.activity !== undefined ? { activity: run.activity } : {}),
  }
}

function jsonResponse(body: ReconstructedGeneration): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  })
}

export interface GetGenerationHydrationOptions {
  /**
   * How to interpret `id`:
   * - `'runId'` loads exactly that run via `stores.generationRuns.get`.
   * - `'threadId'` (default) loads the latest run linked to the thread via
   *   `stores.generationRuns.findLatestForThread`.
   */
  by?: 'threadId' | 'runId'
}

/**
 * The request-free core of {@link reconstructGeneration}: read the last
 * generation run for a thread (or a specific run) straight from the
 * `generationRuns` store and return the plain `{ resumeSnapshot, activeRun }`
 * hydration payload a server-authoritative client adopts on mount.
 *
 * Use this from a TanStack Start server function (or any direct call) to back
 * a client's `hydrateGeneration` handler without fabricating a `Request`:
 *
 * ```ts
 * async function loadImageHydration({ data: threadId }: { data: string }) {
 *   // Do your own auth here — this helper does not enforce tenancy.
 *   return await getGenerationHydration(persistence, threadId)
 * }
 * ```
 *
 * Wire that body up as the server function's handler — build it with
 * `createServerFn({ method: 'GET' })`, add an `inputValidator` that returns
 * the thread id, then hand it the function above. (The chained call is shown
 * split apart on purpose: Start's server-fn plugin decides which modules to
 * transform by scanning source text for that call, and a package whose shipped
 * comments contain it gets pulled into the transform.)
 *
 * ⚠️ Unlike {@link reconstructGeneration} this helper takes **no** `authorize`
 * option — there is no `Request` to authorize against. Server-function callers
 * must gate the call themselves (session → owned thread/run) before resolving
 * the id, or any caller who guesses an id receives the run's status and result
 * metadata.
 *
 * Returns `{ resumeSnapshot: null, activeRun: null }` when `id` is empty or no
 * matching run exists, so the caller never has to special-case a first load.
 */
export async function getGenerationHydration(
  persistence: AIPersistence,
  id: string,
  options?: GetGenerationHydrationOptions,
): Promise<ReconstructedGeneration> {
  validateReconstructGenerationStores(persistence)
  const runStore = persistence.stores.generationRuns
  if (!runStore) {
    // validateReconstructGenerationStores already throws; this narrows for TS.
    throw new Error('getGenerationHydration requires stores.generationRuns.')
  }

  if (!id) {
    return { resumeSnapshot: null, activeRun: null }
  }

  const run =
    options?.by === 'runId'
      ? await runStore.get(id)
      : await runStore.findLatestForThread(id)

  if (!run) {
    return { resumeSnapshot: null, activeRun: null }
  }

  return {
    resumeSnapshot: runToSnapshot(run),
    activeRun: run.status === 'running' ? { runId: run.runId } : null,
  }
}

/**
 * Build the JSON `Response` a server-authoritative client hydrates a generation
 * from on load. Reads a `?runId=` (preferred) or `?threadId=` from the request
 * query and returns `{ resumeSnapshot, activeRun }`
 * ({@link ReconstructedGeneration}):
 *
 * - Resolves the run by `runId` via `stores.generationRuns.get`, else the
 *   latest run filed under `threadId` via the required
 *   `stores.generationRuns.findLatestForThread`.
 * - `resumeSnapshot` — the run mapped to a client snapshot (status, result,
 *   error, activity, and a `resumeState` cursor while still running), or `null`.
 * - `activeRun` — `{ runId }` when the run is still generating, else `null`.
 *
 * Requires `stores.generationRuns`. Returns
 * `{ resumeSnapshot: null, activeRun: null }` when no id is supplied or no
 * matching run exists, so the caller never has to special-case a first load.
 *
 * This helper does **not** enforce tenancy by itself. Pass
 * {@link ReconstructGenerationOptions.authorize} (or wrap the call in your own
 * session gate) before exposing it on a public route.
 *
 * ```ts
 * export async function GET(request: Request) {
 *   return reconstructGeneration(persistence, request, {
 *     authorize: async (id, req) => {
 *       const userId = await getSessionUserId(req)
 *       return userId != null && (await userOwnsThread(userId, id))
 *     },
 *   })
 * }
 * ```
 */
export async function reconstructGeneration(
  persistence: AIPersistence,
  request: Request,
  options?: ReconstructGenerationOptions,
): Promise<Response> {
  const params = new URL(request.url).searchParams
  const runParam = options?.runParam ?? 'runId'
  const threadParam = options?.param ?? 'threadId'
  const runId = params.get(runParam) ?? ''
  const threadId = params.get(threadParam) ?? ''

  const id = runId || threadId
  if (!id) {
    return jsonResponse({ resumeSnapshot: null, activeRun: null })
  }

  if (options?.authorize) {
    const decision = await options.authorize(id, request)
    if (decision instanceof Response) {
      return decision
    }
    if (!decision) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'no-store',
        },
      })
    }
  }

  return jsonResponse(
    await getGenerationHydration(persistence, id, {
      by: runId ? 'runId' : 'threadId',
    }),
  )
}

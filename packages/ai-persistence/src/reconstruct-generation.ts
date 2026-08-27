import { validateReconstructGenerationStores } from './types'
import type { AIPersistence, GenerationRunRecord } from './types'

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
  authorize?: (
    id: string,
    request: Request,
  ) => boolean | Response | Promise<boolean | Response>
}

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
  by?: 'threadId' | 'runId'
}

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

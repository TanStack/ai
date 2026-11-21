import { createFileRoute } from '@tanstack/react-router'
import {
  EventType,
  cancelMotionJob,
  generateMotion,
  generationParamsFromRequest,
  getMotionJobStatus,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { falMotion } from '@tanstack/ai-fal'
import { meshyMotion } from '@tanstack/ai-meshy'
import { uthanaMotion } from '@tanstack/ai-uthana'
import { recordFromBody } from '@/lib/request-body'
import type { StreamChunk } from '@tanstack/ai'

/**
 * Motion generation through `falMotion` with a fake fal queue API.
 *
 * The POST body picks a `mode` and a fake fal `scenario`:
 * - `stream`: the AG-UI body the generation hooks send (`forwardedProps`
 *   holds `prompt`, `mode`, `scenario`). Answers with SSE.
 * - `submit`: `{ prompt }` → `{ jobId, model }`.
 * - `status`: `{ jobId }` → `getMotionJobStatus` result.
 * - `cancel`: `{ jobId }` → `cancelMotionJob`.
 *
 * With `provider: 'uthana'`, `stream` and `cancel` run `uthanaMotion` against a
 * fake Uthana GraphQL API and file endpoint instead (see `fakeUthana`).
 *
 * With `provider: 'meshy'`, `stream` and `cancel` run `meshyMotion('prime')`
 * against a fake Meshy text to motion API instead (see `fakeMeshyMotion`).
 *
 * Each request builds its own fake fal, so parallel tests share no state.
 * Every JSON answer lists the fal requests the adapter made (`falCalls`).
 */

const MODEL = 'fal-ai/hunyuan-motion'
const QUEUE_APP = `https://queue.fal.run/${MODEL}`
const JOB_ID = 'motion-e2e-job'

type Mode = 'stream' | 'submit' | 'status' | 'cancel'

interface FakeAnswer {
  status?: number
  statusText?: string
  body: unknown
}

interface FalScenario {
  /** Answers to the status poll, in order. The last one repeats. */
  statuses: Array<FakeAnswer>
  cancel: FakeAnswer
}

const queued = (position: number): FakeAnswer => ({
  body: { status: 'IN_QUEUE', queue_position: position },
})
const inProgress: FakeAnswer = { body: { status: 'IN_PROGRESS' } }
const completed: FakeAnswer = { body: { status: 'COMPLETED' } }
const cancelAccepted: FakeAnswer = {
  body: { status: 'CANCELLATION_REQUESTED' },
}

const SCENARIOS = {
  /** Queued, then running, then done. */
  complete: {
    statuses: [queued(2), inProgress, completed],
    cancel: cancelAccepted,
  },
  /** Already done on the first poll. */
  finished: { statuses: [completed], cancel: cancelAccepted },
  /** fal completes the request with an error. */
  fail: {
    statuses: [
      queued(1),
      {
        body: {
          status: 'COMPLETED',
          error: 'Runner crashed: out of GPU memory',
        },
      },
    ],
    cancel: cancelAccepted,
  },
  /** fal refuses a cancel because the request already completed. */
  'already-completed': {
    statuses: [completed],
    cancel: {
      status: 400,
      statusText: 'Bad Request',
      body: { status: 'ALREADY_COMPLETED' },
    },
  },
} satisfies Record<string, FalScenario>

type ScenarioName = keyof typeof SCENARIOS

const RESULT_BODY = {
  fbx_file: {
    url: 'https://v3b.fal.media/files/e2e/swing.fbx',
    content_type: 'application/octet-stream',
    file_name: 'swing.fbx',
    file_size: 48_213,
  },
  motion_json: { url: 'https://v3b.fal.media/files/e2e/swing.json' },
  seed: 42,
}

function isScenarioName(value: unknown): value is ScenarioName {
  return typeof value === 'string' && Object.hasOwn(SCENARIOS, value)
}

function isMode(value: unknown): value is Mode {
  return (
    value === 'stream' ||
    value === 'submit' ||
    value === 'status' ||
    value === 'cancel'
  )
}

function jsonResponse(answer: FakeAnswer) {
  return new Response(JSON.stringify(answer.body), {
    status: answer.status ?? 200,
    statusText: answer.statusText ?? 'OK',
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * A fake fal queue API for one scenario. Only the fixed job id has routes,
 * so a call with any other job id gets a 404.
 */
function fakeFal(scenario: FalScenario) {
  const falCalls: Array<string> = []
  let statusPolls = 0
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    const url = request.url.split('?')[0]
    const call = `${request.method} ${url}`
    falCalls.push(call)
    switch (call) {
      case `POST ${QUEUE_APP}`:
        return jsonResponse({ body: { request_id: JOB_ID } })
      case `GET ${QUEUE_APP}/requests/${JOB_ID}/status`: {
        const index = Math.min(statusPolls, scenario.statuses.length - 1)
        statusPolls += 1
        return jsonResponse(scenario.statuses[index])
      }
      case `GET ${QUEUE_APP}/requests/${JOB_ID}`:
        return jsonResponse({ body: RESULT_BODY })
      case `PUT ${QUEUE_APP}/requests/${JOB_ID}/cancel`:
        return jsonResponse(scenario.cancel)
      default:
        return jsonResponse({
          status: 404,
          statusText: 'Not Found',
          body: { detail: `no fake fal route for ${call}` },
        })
    }
  }
  return { fetch, falCalls }
}

const UTHANA_FBX = 'Kaydara FBX Binary  uthana-e2e'

/**
 * A fake Uthana: job READY, then RESERVED, then FINISHED with motion
 * `motion-e2e`, and an FBX on any character. Records the file URLs asked for.
 */
function fakeUthana() {
  const downloads: Array<string> = []
  let polls = 0
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    if (request.url.includes('/motion/file/')) {
      downloads.push(request.url)
      return new Response(new TextEncoder().encode(UTHANA_FBX))
    }
    const text = await request.text()
    if (text.includes('create_text_to_motion_job')) {
      return Response.json({
        data: {
          create_text_to_motion_job: {
            job: { id: 'uthana-job', status: 'READY' },
          },
        },
      })
    }
    const states = [
      { status: 'READY' },
      { status: 'RESERVED' },
      {
        status: 'FINISHED',
        result: { exc: null, result: { id: 'motion-e2e' } },
      },
    ]
    const job = states[Math.min(polls, states.length - 1)]
    polls += 1
    return Response.json({ data: { job: { id: 'uthana-job', ...job } } })
  }
  return { fetch, downloads }
}

async function handleUthana(
  request: Request,
  props: Record<string, unknown>,
): Promise<Response> {
  const uthana = fakeUthana()
  const adapter = uthanaMotion('text-to-motion-3.0', {
    apiKey: 'uthana-e2e',
    fetch: uthana.fetch,
    defaults: { character_id: 'orc-e2e', fps: 30 },
  })
  if (props.mode === 'cancel' && typeof props.jobId === 'string') {
    try {
      await cancelMotionJob({ adapter, jobId: props.jobId })
      return Response.json({ ok: true })
    } catch (error) {
      return Response.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        },
        { status: 501 },
      )
    }
  }
  if (props.mode !== 'stream')
    return badRequest('uthana supports stream and cancel')
  const { input, threadId, runId } = await generationParamsFromRequest(
    'motion',
    request,
  )
  const stream = generateMotion({
    adapter,
    threadId,
    runId,
    prompt: input.prompt,
    duration: 4,
    stream: true,
    pollingInterval: 0,
  })
  return toServerSentEventsResponse(stream)
}

const MESHY_BASE_URL = 'https://api.meshy.ai/openapi'
const MESHY_MOTION_PATH = '/v1/text-to-motion'
const MESHY_JOB_ID = 'motion-task-e2e'
const MESHY_TASK_PATH = `${MESHY_MOTION_PATH}/${MESHY_JOB_ID}`

/** One request that the Meshy adapter sent to the fake Meshy. */
interface MeshyRequest {
  method: string
  /** The path after the Meshy base URL. */
  path: string
  /** The JSON body. Only a `POST` has one. */
  body?: unknown
}

// Meshy sends empty result fields until the task succeeds.
const NO_MOTION_YET = {
  motion_url: '',
  motion_format: '',
  duration_ms: 0,
  mode: '',
}

/** The answers to a `GET` of the task, in order. The last one repeats. */
const MESHY_MOTION_STATES = [
  { id: MESHY_JOB_ID, status: 'PENDING', progress: 0, result: NO_MOTION_YET },
  {
    id: MESHY_JOB_ID,
    status: 'IN_PROGRESS',
    progress: 60,
    result: NO_MOTION_YET,
  },
  {
    id: MESHY_JOB_ID,
    status: 'SUCCEEDED',
    progress: 100,
    result: {
      motion_url: 'https://assets.meshy.ai/e2e/swing.fbx',
      motion_format: 'fbx',
      duration_ms: 4000,
      mode: 'prime',
    },
  },
]

/**
 * A fake Meshy text to motion API. A `POST` creates task `motion-task-e2e`.
 * A `GET` of the task answers `PENDING`, then `IN_PROGRESS`, then
 * `SUCCEEDED`. A `DELETE` answers 409, as Meshy does for a running task. It
 * records each request, so the spec can check the bodies.
 */
function fakeMeshyMotion() {
  const requests: Array<MeshyRequest> = []
  let reads = 0
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    const path = request.url.slice(MESHY_BASE_URL.length)
    const text = await request.text()
    requests.push({
      method: request.method,
      path,
      ...(text ? { body: JSON.parse(text) } : {}),
    })
    const call = `${request.method} ${path}`
    switch (call) {
      case `POST ${MESHY_MOTION_PATH}`:
        return Response.json({ result: MESHY_JOB_ID }, { status: 202 })
      case `GET ${MESHY_TASK_PATH}`: {
        const index = Math.min(reads, MESHY_MOTION_STATES.length - 1)
        reads += 1
        return Response.json(MESHY_MOTION_STATES[index])
      }
      case `DELETE ${MESHY_TASK_PATH}`:
        return Response.json(
          { message: 'Task is in progress' },
          { status: 409 },
        )
      default:
        return Response.json(
          { message: `no fake Meshy route for ${call}` },
          { status: 404 },
        )
    }
  }
  return { fetch, requests }
}

/**
 * Passes the stream through. Before `RUN_FINISHED`, it sends a
 * `meshy:requests` custom event with the Meshy requests, so the spec can
 * check them.
 */
async function* withMeshyRequests(
  stream: AsyncIterable<StreamChunk>,
  requests: Array<MeshyRequest>,
) {
  for await (const chunk of stream) {
    if (chunk.type === EventType.RUN_FINISHED) {
      const requestsEvent: StreamChunk = {
        type: EventType.CUSTOM,
        name: 'meshy:requests',
        value: requests,
        timestamp: Date.now(),
      }
      yield requestsEvent
    }
    yield chunk
  }
}

async function handleMeshy(request: Request, props: Record<string, unknown>) {
  const meshy = fakeMeshyMotion()
  const adapter = meshyMotion('prime', {
    apiKey: 'meshy-e2e',
    fetch: meshy.fetch,
  })
  if (props.mode === 'cancel' && typeof props.jobId === 'string') {
    try {
      await cancelMotionJob({ adapter, jobId: props.jobId })
      return Response.json({ ok: true, meshyRequests: meshy.requests })
    } catch (error) {
      return Response.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          meshyRequests: meshy.requests,
        },
        { status: 500 },
      )
    }
  }
  if (props.mode !== 'stream') {
    return badRequest('meshy supports stream and cancel')
  }
  const { input, threadId, runId } = await generationParamsFromRequest(
    'motion',
    request,
  )
  const stream = generateMotion({
    adapter,
    threadId,
    runId,
    prompt: input.prompt,
    duration: 4,
    stream: true,
    pollingInterval: 0,
  })
  return toServerSentEventsResponse(withMeshyRequests(stream, meshy.requests))
}

function badRequest(error: string) {
  return Response.json({ ok: false, error }, { status: 400 })
}

export const Route = createFileRoute('/api/motion')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const props = recordFromBody(await request.clone().json())
        if (props.provider === 'uthana') return handleUthana(request, props)
        if (props.provider === 'meshy') return handleMeshy(request, props)
        const { mode, scenario } = props
        if (!isMode(mode)) return badRequest(`Unknown mode: ${String(mode)}`)
        if (!isScenarioName(scenario)) {
          return badRequest(`Unknown scenario: ${String(scenario)}`)
        }

        const fal = fakeFal(SCENARIOS[scenario])
        const adapter = falMotion(MODEL, {
          apiKey: 'fal-e2e',
          fetch: fal.fetch,
        })

        if (mode === 'stream') {
          const { input, threadId, runId } = await generationParamsFromRequest(
            'motion',
            request,
          )
          const abortController = new AbortController()
          const stream = generateMotion({
            adapter,
            threadId,
            runId,
            prompt: input.prompt,
            stream: true,
            pollingInterval: 0,
            abortSignal: abortController.signal,
          })
          return toServerSentEventsResponse(stream, { abortController })
        }

        try {
          switch (mode) {
            case 'submit': {
              if (typeof props.prompt !== 'string') {
                return badRequest('prompt is required')
              }
              const job = await generateMotion({
                adapter,
                threadId: 'motion-e2e',
                prompt: props.prompt,
              })
              return Response.json({ ok: true, ...job, falCalls: fal.falCalls })
            }
            case 'status': {
              if (typeof props.jobId !== 'string') {
                return badRequest('jobId is required')
              }
              const status = await getMotionJobStatus({
                adapter,
                jobId: props.jobId,
              })
              return Response.json({
                ok: true,
                ...status,
                falCalls: fal.falCalls,
              })
            }
            case 'cancel': {
              if (typeof props.jobId !== 'string') {
                return badRequest('jobId is required')
              }
              await cancelMotionJob({ adapter, jobId: props.jobId })
              return Response.json({ ok: true, falCalls: fal.falCalls })
            }
          }
        } catch (error) {
          return Response.json(
            {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
              falCalls: fal.falCalls,
            },
            { status: 500 },
          )
        }
      },
    },
  },
})

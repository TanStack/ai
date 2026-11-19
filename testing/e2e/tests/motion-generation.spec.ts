import { test, expect } from './fixtures'
import type { APIRequestContext } from '@playwright/test'

// /api/motion runs falMotion against a fake fal queue (see the route file).
// The fake answers only for this job id.
const JOB_ID = 'motion-e2e-job'
const MODEL = 'fal-ai/hunyuan-motion'
const REQUEST_URL = `https://queue.fal.run/${MODEL}/requests/${JOB_ID}`
const FBX_URL = 'https://v3b.fal.media/files/e2e/swing.fbx'
const JSON_URL = 'https://v3b.fal.media/files/e2e/swing.json'
const PROMPT = 'A heavy two-handed overhead axe swing'
const UTHANA_JOB_ID = 'uthana-job?character=orc-e2e&fps=30'

interface StreamEvent {
  type: string
  name?: unknown
  value?: unknown
  message?: unknown
}

function isStreamEvent(value: unknown): value is StreamEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string'
  )
}

function parseSse(body: string): Array<StreamEvent> {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line): unknown => JSON.parse(line.slice('data:'.length).trim()))
    .filter(isStreamEvent)
}

function customEvents(events: Array<StreamEvent>) {
  return events.flatMap((event) =>
    event.type === 'CUSTOM' ? [{ name: event.name, value: event.value }] : [],
  )
}

/** POST the AG-UI body that `useGeneration` sends, in stream mode. */
async function streamMotion(
  request: APIRequestContext,
  testId: string,
  scenario: 'complete' | 'fail',
) {
  const res = await request.post('/api/motion', {
    data: {
      threadId: `motion-thread-${testId}`,
      runId: `motion-run-${testId}`,
      state: {},
      messages: [],
      tools: [],
      context: [],
      forwardedProps: { prompt: PROMPT, mode: 'stream', scenario },
    },
  })
  expect(res.ok()).toBe(true)
  expect(res.headers()['content-type']).toContain('text/event-stream')
  return parseSse(await res.text())
}

async function postMotion(
  request: APIRequestContext,
  data: {
    mode: 'submit' | 'status' | 'cancel'
    scenario: 'finished' | 'already-completed'
    prompt?: string
    jobId?: string
  },
) {
  const res = await request.post('/api/motion', { data })
  const body: unknown = await res.json()
  return { status: res.status(), body }
}

function jobIdOf(body: unknown) {
  if (
    typeof body !== 'object' ||
    body === null ||
    !('jobId' in body) ||
    typeof body.jobId !== 'string'
  ) {
    throw new Error(`Submit answer has no jobId: ${JSON.stringify(body)}`)
  }
  return body.jobId
}

test.describe('generateMotion activity (fal)', () => {
  test('streams a queued job over SSE until the FBX asset is ready', async ({
    request,
    testId,
  }) => {
    const events = await streamMotion(request, testId, 'complete')

    expect(events[0]?.type).toBe('RUN_STARTED')
    expect(customEvents(events)).toEqual([
      {
        name: 'motion:job:created',
        value: { jobId: JOB_ID, model: MODEL },
      },
      {
        name: 'motion:status',
        value: { jobId: JOB_ID, status: 'pending', queuePosition: 2 },
      },
      {
        name: 'motion:status',
        value: { jobId: JOB_ID, status: 'processing' },
      },
      {
        name: 'motion:status',
        value: { jobId: JOB_ID, status: 'completed' },
      },
      {
        name: 'generation:result',
        value: {
          jobId: JOB_ID,
          model: MODEL,
          assets: [
            {
              url: FBX_URL,
              format: 'fbx',
              contentType: 'application/octet-stream',
              fileName: 'swing.fbx',
              fileSize: 48_213,
            },
            { url: JSON_URL, format: 'json' },
          ],
          seed: 42,
        },
      },
    ])
    expect(events.at(-1)?.type).toBe('RUN_FINISHED')
  })

  test('ends the stream with RUN_ERROR when fal completes the job with an error', async ({
    request,
    testId,
  }) => {
    const events = await streamMotion(request, testId, 'fail')

    const last = events.at(-1)
    expect(last?.type).toBe('RUN_ERROR')
    expect(last?.message).toBe('Runner crashed: out of GPU memory')
    expect(events.some((event) => event.type === 'RUN_FINISHED')).toBe(false)
  })

  test('submits a job, then reads the finished motion in a separate request', async ({
    request,
  }) => {
    const submit = await postMotion(request, {
      mode: 'submit',
      scenario: 'finished',
      prompt: PROMPT,
    })
    expect(submit).toEqual({
      status: 200,
      body: {
        ok: true,
        jobId: JOB_ID,
        model: MODEL,
        falCalls: [`POST https://queue.fal.run/${MODEL}`],
      },
    })

    const status = await postMotion(request, {
      mode: 'status',
      scenario: 'finished',
      jobId: jobIdOf(submit.body),
    })
    expect(status.status).toBe(200)
    expect(status.body).toMatchObject({
      ok: true,
      jobId: JOB_ID,
      status: 'completed',
      motion: {
        jobId: JOB_ID,
        assets: [{ url: FBX_URL, format: 'fbx' }, { url: JSON_URL }],
      },
      falCalls: [`GET ${REQUEST_URL}/status`, `GET ${REQUEST_URL}`],
    })
  })

  test('cancels a job with a PUT to the fal cancel URL', async ({
    request,
  }) => {
    const cancel = await postMotion(request, {
      mode: 'cancel',
      scenario: 'finished',
      jobId: JOB_ID,
    })

    expect(cancel).toEqual({
      status: 200,
      body: { ok: true, falCalls: [`PUT ${REQUEST_URL}/cancel`] },
    })
  })

  test('reports an error when fal refuses the cancel', async ({ request }) => {
    const cancel = await postMotion(request, {
      mode: 'cancel',
      scenario: 'already-completed',
      jobId: JOB_ID,
    })

    expect(cancel).toEqual({
      status: 500,
      body: {
        ok: false,
        error: 'Bad Request',
        falCalls: [`PUT ${REQUEST_URL}/cancel`],
      },
    })
  })

  test('useGeneration shows each motion status and the finished assets', async ({
    page,
  }) => {
    await page.goto('/motion-test')
    const generate = page.getByTestId('generate-motion')
    await expect(generate).toBeEnabled()
    await generate.click()

    await expect(page.getByTestId('motion-generation-status')).toHaveText(
      'success',
    )
    await expect(page.getByTestId('motion-statuses')).toHaveText(
      'pending > processing > completed',
    )
    await expect(page.getByTestId('motion-assets').locator('li')).toHaveText([
      `fbx ${FBX_URL}`,
      `json ${JSON_URL}`,
    ])
  })
})

test.describe('generateMotion activity (uthana)', () => {
  test('streams an Uthana job and returns the FBX inline on the chosen character', async ({
    request,
    testId,
  }) => {
    const res = await request.post('/api/motion', {
      data: {
        threadId: `uthana-thread-${testId}`,
        runId: `uthana-run-${testId}`,
        state: {},
        messages: [],
        tools: [],
        context: [],
        forwardedProps: { prompt: PROMPT, mode: 'stream', provider: 'uthana' },
      },
    })
    expect(res.ok()).toBe(true)
    const events = parseSse(await res.text())
    const custom = customEvents(events)

    expect(custom.filter((e) => e.name === 'motion:status')).toEqual([
      {
        name: 'motion:status',
        value: { jobId: UTHANA_JOB_ID, status: 'pending' },
      },
      {
        name: 'motion:status',
        value: { jobId: UTHANA_JOB_ID, status: 'processing' },
      },
      {
        name: 'motion:status',
        value: { jobId: UTHANA_JOB_ID, status: 'completed' },
      },
    ])
    const result = custom.find((e) => e.name === 'generation:result')?.value
    expect(result).toMatchObject({
      jobId: UTHANA_JOB_ID,
      model: 'text-to-motion-3.0',
      assets: [
        {
          format: 'fbx',
          fileName: 'uthana-motion-e2e.fbx',
          contentType: 'application/fbx',
          url: `data:application/fbx;base64,${Buffer.from('Kaydara FBX Binary  uthana-e2e').toString('base64')}`,
        },
      ],
    })
    expect(events.at(-1)?.type).toBe('RUN_FINISHED')
  })

  test('refuses a remote cancel because Uthana has no cancel API', async ({
    request,
  }) => {
    const res = await request.post('/api/motion', {
      data: { provider: 'uthana', mode: 'cancel', jobId: 'uthana-job' },
    })
    expect(res.status()).toBe(501)
    expect(await res.json()).toEqual({
      ok: false,
      error:
        'The uthana motion adapter cannot cancel jobs: the provider has no cancel API.',
    })
  })
})

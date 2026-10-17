import { test, expect } from './fixtures'
import type { APIRequestContext } from '@playwright/test'

interface Started {
  error?: string
  runId: string
  receipt?: { status: string }
}

interface Read {
  error?: string
  answered: boolean
  transcript: Array<{ role: string; text: string }>
  hostACalls: number
  workerCalls: number
}

/** Start a run of `scenario`, and return its id. */
async function start(
  request: APIRequestContext,
  scenario: 'submit' | 'schedule',
) {
  const res = await request.post('/api/harness-worker', { data: { scenario } })
  expect(res.ok()).toBe(true)
  const started: Started = await res.json()
  expect(started.error ?? null).toBeNull()
  return started
}

/** Read the thread of `runId` from host A until it has an answer. */
async function readAnswer(request: APIRequestContext, runId: string) {
  let read: Read | undefined
  await expect
    .poll(
      async () => {
        const res = await request.get(`/api/harness-worker?runId=${runId}`)
        read = await res.json()
        return read?.error ?? read?.answered
      },
      { timeout: 20_000 },
    )
    .toBe(true)
  return read!
}

test.describe('harness: a worker runs the threads that no host runs', () => {
  test('runs an input that another host submitted', async ({ request }) => {
    const started = await start(request, 'submit')
    // Host A stores the input and runs nothing.
    expect(started.receipt?.status).toBe('queued')

    const read = await readAnswer(request, started.runId)
    expect(read.transcript).toEqual([
      { role: 'user', text: '[harness-worker] submitted' },
      { role: 'assistant', text: 'Done by the worker.' },
    ])
    expect(read.workerCalls).toBe(1)
    expect(read.hostACalls).toBe(0)
  })

  test('runs a schedule at its time, after the host that made it stopped', async ({
    request,
  }) => {
    const started = await start(request, 'schedule')

    const read = await readAnswer(request, started.runId)
    expect(read.transcript).toEqual([
      { role: 'user', text: '[harness-worker] scheduled' },
      { role: 'assistant', text: 'Done by the worker.' },
    ])
    expect(read.workerCalls).toBe(1)
    expect(read.hostACalls).toBe(0)
  })
})

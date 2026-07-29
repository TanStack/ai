import { describe, expect, it } from 'vitest'
import { memoryPersistence } from '../src/memory'
import { reconstructGeneration } from '../src/reconstruct-generation'
import type { ReconstructedGeneration } from '../src/reconstruct-generation'

async function body(response: Response): Promise<ReconstructedGeneration> {
  return (await response.json()) as ReconstructedGeneration
}

describe('reconstructGeneration', () => {
  it('maps a completed job to a resume snapshot', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.generationRuns.createOrResume({
      runId: 'job-done',
      threadId: 'thread-1',
      activity: 'image',
      provider: 'test-image-provider',
      model: 'test-image-model',
      startedAt: 1000,
    })
    await persistence.stores.generationRuns.update('job-done', {
      status: 'complete',
      finishedAt: 2000,
      result: { id: 'image-result' },
    })

    const response = await reconstructGeneration(
      persistence,
      new Request('http://example.test/api/generation?threadId=thread-1'),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')

    const parsed = await body(response)
    expect(parsed).toEqual({
      resumeSnapshot: {
        schemaVersion: 1,
        resumeState: null,
        status: 'complete',
        result: { id: 'image-result' },
        activity: 'image',
      },
      activeRun: null,
    })
  })

  it('reports an active run and resume state for a running job', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.generationRuns.createOrResume({
      runId: 'job-live',
      threadId: 'thread-live',
      activity: 'video',
      provider: 'test-video-provider',
      model: 'test-video-model',
      startedAt: 5000,
    })

    // Resolve by runId directly.
    const parsed = await body(
      await reconstructGeneration(
        persistence,
        new Request('http://example.test/api/generation?runId=job-live'),
      ),
    )
    expect(parsed.activeRun).toEqual({ runId: 'job-live' })
    expect(parsed.resumeSnapshot).toMatchObject({
      status: 'running',
      resumeState: { runId: 'job-live', threadId: 'thread-live' },
      activity: 'video',
    })
  })

  it('surfaces an interrupted job as error status', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.generationRuns.createOrResume({
      runId: 'job-int',
      threadId: 'thread-int',
      activity: 'audio',
      provider: 'p',
      model: 'm',
      startedAt: 1,
    })
    await persistence.stores.generationRuns.update('job-int', {
      status: 'interrupted',
      finishedAt: 2,
    })

    const parsed = await body(
      await reconstructGeneration(
        persistence,
        new Request('http://example.test/api/generation?runId=job-int'),
      ),
    )
    expect(parsed.resumeSnapshot?.status).toBe('error')
    expect(parsed.resumeSnapshot?.resumeState).toBeNull()
    expect(parsed.activeRun).toBeNull()
  })

  it('returns nulls when the id is missing or the thread is unknown', async () => {
    const persistence = memoryPersistence()

    const missing = await body(
      await reconstructGeneration(
        persistence,
        new Request('http://example.test/api/generation'),
      ),
    )
    expect(missing).toEqual({ resumeSnapshot: null, activeRun: null })

    const unknown = await body(
      await reconstructGeneration(
        persistence,
        new Request('http://example.test/api/generation?threadId=nope'),
      ),
    )
    expect(unknown).toEqual({ resumeSnapshot: null, activeRun: null })
  })

  it('returns 403 when authorize returns false', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.generationRuns.createOrResume({
      runId: 'job-secret',
      threadId: 'thread-secret',
      activity: 'image',
      provider: 'p',
      model: 'm',
      startedAt: 1,
    })

    const response = await reconstructGeneration(
      persistence,
      new Request('http://example.test/api/generation?runId=job-secret'),
      { authorize: () => false },
    )
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Forbidden' })
  })
})

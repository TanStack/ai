import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canonicalInterruptJson, digestInterruptJson } from '@tanstack/ai'
import { createInterruptLabPersistence } from './persistence'
import type * as DurableRouteModule from '../../routes/api.durable-interrupts'
import type * as EphemeralRouteModule from '../../routes/api.interrupts'

const temporaryDirectories: Array<string> = []
let previousDatabaseUrl: string | undefined
let durableRoute: typeof DurableRouteModule
let ephemeralRoute: typeof EphemeralRouteModule

beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tanstack-interrupt-route-'))
  temporaryDirectories.push(directory)
  previousDatabaseUrl = process.env.INTERRUPT_LAB_DB_URL
  process.env.INTERRUPT_LAB_DB_URL = `file:${join(directory, 'production.sqlite')}`
  ;[ephemeralRoute, durableRoute] = await Promise.all([
    import('../../routes/api.interrupts'),
    import('../../routes/api.durable-interrupts'),
  ])
})

afterAll(async () => {
  durableRoute.durableInterruptLabPersistence.close()
  if (previousDatabaseUrl === undefined) {
    delete process.env.INTERRUPT_LAB_DB_URL
  } else {
    process.env.INTERRUPT_LAB_DB_URL = previousDatabaseUrl
  }
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

describe('interrupt lab production route composition', () => {
  it('keeps the ephemeral endpoint entirely persistence-free', () => {
    expect(ephemeralRoute.interruptLabRouteConfig).toEqual({
      mode: 'ephemeral',
    })
    expect(
      'persistenceMiddleware' in ephemeralRoute.interruptLabRouteConfig,
    ).toBe(false)
  })

  it('wires the durable endpoint to the dedicated real SQLite composition', () => {
    expect(durableRoute.durableInterruptLabRouteConfig).toMatchObject({
      mode: 'durable',
    })
    expect(
      durableRoute.durableInterruptLabRouteConfig.persistenceMiddleware,
    ).toBe(durableRoute.durableInterruptLabMiddleware)
    expect(
      durableRoute.durableInterruptLabPersistence.stores.interrupts,
    ).toBeDefined()
    expect(
      durableRoute.durableInterruptLabPersistence.stores.runs,
    ).toBeDefined()
    expect(
      durableRoute.durableInterruptLabPersistence.stores.messages,
    ).toBeDefined()
  })

  it('opens an atomic interrupt batch in an isolated SQLite database', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tanstack-interrupt-lab-'))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, 'interrupts.sqlite')
    const persistence = createInterruptLabPersistence({
      url: `file:${databasePath}`,
    })

    try {
      const opened = await persistence.stores.interrupts.openInterruptBatch({
        threadId: 'durable-lab:thread-1',
        interruptedRunId: 'run-1',
        descriptors: [
          {
            id: 'generic-1',
            reason: 'interrupt_lab:generic_question',
            responseSchema: { type: 'object' },
          },
        ],
        bindings: [
          {
            kind: 'generic',
            interruptId: 'generic-1',
            responseSchemaHash: 'sha256:test',
          },
        ],
      })

      expect(opened).toMatchObject({
        generation: 1,
        descriptors: [{ id: 'generic-1' }],
      })
    } finally {
      persistence.close()
    }
  })

  it('returns authoritative interrupt recovery state from the durable route', async () => {
    const threadId = 'durable-lab:recovery-thread'
    const interruptedRunId = 'recovery-run'
    await durableRoute.durableInterruptLabPersistence.stores.interrupts.openInterruptBatch(
      {
        threadId,
        interruptedRunId,
        descriptors: [
          {
            id: 'recovery-interrupt',
            reason: 'interrupt_lab:recovery',
            responseSchema: { type: 'boolean' },
          },
        ],
        bindings: [
          {
            kind: 'generic',
            interruptId: 'recovery-interrupt',
            responseSchemaHash: 'sha256:recovery-test',
          },
        ],
      },
    )

    const response = await durableRoute.durableInterruptLabRequest(
      new Request(
        `http://localhost/api/durable-interrupts?threadId=${threadId}&interruptedRunId=${interruptedRunId}&knownGeneration=1`,
        { method: 'POST' },
      ),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: 1,
      state: 'pending',
      threadId,
      interruptedRunId,
      generation: 1,
      pendingInterrupts: [
        {
          id: 'recovery-interrupt',
          metadata: {
            'tanstack:interruptBinding': {
              kind: 'generic',
              interruptId: 'recovery-interrupt',
              interruptedRunId,
              generation: 1,
              responseSchemaHash: 'sha256:recovery-test',
            },
          },
        },
      ],
    })
  })

  it('redacts committed interrupt resolutions from the durable recovery route', async () => {
    const threadId = 'durable-lab:committed-recovery-thread'
    const interruptedRunId = 'committed-recovery-run'
    const continuationRunId = 'committed-continuation-run'
    const interruptId = 'committed-recovery-interrupt'
    const resolutions = [
      {
        interruptId,
        status: 'resolved' as const,
        payload: { secret: 'must-not-leave-the-server' },
      },
    ]
    const canonicalResolutions = canonicalInterruptJson(resolutions)
    const fingerprint = digestInterruptJson(canonicalResolutions)
    await durableRoute.durableInterruptLabPersistence.stores.interrupts.openInterruptBatch(
      {
        threadId,
        interruptedRunId,
        descriptors: [
          {
            id: interruptId,
            reason: 'interrupt_lab:committed-recovery',
            responseSchema: { type: 'object' },
          },
        ],
        bindings: [
          {
            kind: 'generic',
            interruptId,
            responseSchemaHash: 'sha256:committed-recovery-test',
          },
        ],
      },
    )
    await durableRoute.durableInterruptLabPersistence.stores.interrupts.commitInterruptResolutions(
      {
        threadId,
        interruptedRunId,
        continuationRunId,
        expectedGeneration: 1,
        expectedInterruptIds: [interruptId],
        resolutions,
        canonicalResolutions,
        fingerprint,
      },
    )

    const response = await durableRoute.durableInterruptLabRequest(
      new Request(
        `http://localhost/api/durable-interrupts?threadId=${threadId}&interruptedRunId=${interruptedRunId}&knownGeneration=1`,
        { method: 'POST' },
      ),
    )
    const state = await response.json()

    expect(response.status).toBe(200)
    expect(state).toMatchObject({
      schemaVersion: 1,
      state: 'committed',
      threadId,
      interruptedRunId,
      generation: 1,
      committed: {
        fingerprint,
        continuationRunId,
      },
    })
    expect(state.committed).not.toHaveProperty('resolutions')
    expect(JSON.stringify(state)).not.toContain('must-not-leave-the-server')
  })

  it.each([
    '?threadId=thread-1&interruptedRunId=run-1',
    '?threadId=thread-1&knownGeneration=1',
    '?interruptedRunId=run-1&knownGeneration=1',
    '?threadId=thread-1&interruptedRunId=run-1&knownGeneration=-1',
  ])('rejects an invalid durable recovery query %s', async (search) => {
    const response = await durableRoute.durableInterruptLabRequest(
      new Request(`http://localhost/api/durable-interrupts${search}`, {
        method: 'POST',
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid interrupt recovery query.',
    })
  })

  it('returns a missing durable recovery state for unknown correlation', async () => {
    const response = await durableRoute.durableInterruptLabRequest(
      new Request(
        'http://localhost/api/durable-interrupts?threadId=missing-thread&interruptedRunId=missing-run&knownGeneration=3',
        { method: 'POST' },
      ),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: 1,
      state: 'missing',
      threadId: 'missing-thread',
      interruptedRunId: 'missing-run',
      generation: 3,
      pendingInterrupts: [],
    })
  })

  it('recreates the cached SQLite persistence after the singleton is closed', () => {
    const first = durableRoute.durableInterruptLabPersistence

    first.close()
    const recreated = createInterruptLabPersistence()

    expect(recreated).not.toBe(first)
    expect(recreated.stores.interrupts).toBeDefined()
    recreated.close()
  })
})

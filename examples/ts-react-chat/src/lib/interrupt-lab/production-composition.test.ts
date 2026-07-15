import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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

  it('recreates the cached SQLite persistence after the singleton is closed', () => {
    const first = durableRoute.durableInterruptLabPersistence

    first.close()
    const recreated = createInterruptLabPersistence()

    expect(recreated).not.toBe(first)
    expect(recreated.stores.interrupts).toBeDefined()
    recreated.close()
  })
})

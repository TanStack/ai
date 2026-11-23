import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  createResultMetadataCollector,
  finalizeResultMetadata,
  middlewareResultMetadata,
} from '../src/activities/chat/tools/result-metadata'
import type { AnyTool } from '../src/types'

function createTool(resultMetadataSchema?: AnyTool['resultMetadataSchema']) {
  const tool: AnyTool = {
    name: 'lookup',
    description: 'Look up a record',
    ...(resultMetadataSchema ? { resultMetadataSchema } : {}),
  }
  return tool
}

afterEach(() => {
  vi.restoreAllMocks()
})

/** The error that `finalizeResultMetadata` rejects with, and the server log. */
async function finalizeFailure(tool: AnyTool, value: Record<string, unknown>) {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const error = await finalizeResultMetadata(tool, value).catch(
    (reason: unknown) => reason,
  )
  return { error, warn }
}

const notJsonError = new Error('Result metadata for tool lookup is not JSON')

describe('createResultMetadataCollector', () => {
  it('merges top-level keys and the later key wins', () => {
    const collector = createResultMetadataCollector()
    collector.set({ a: 1, b: 2 })
    collector.set({ a: 3 })
    expect(collector.get()).toEqual({ a: 3, b: 2 })
  })

  it('drops the reserved tanstack key', () => {
    const collector = createResultMetadataCollector()
    collector.set({ a: 1, tanstack: { state: 'x' } })
    expect(collector.get()).toEqual({ a: 1 })
  })

  it('removes a key that is set to undefined', () => {
    const collector = createResultMetadataCollector()
    collector.set({ a: 1, b: 2 })
    collector.set({ b: undefined })
    expect(collector.get()).toEqual({ a: 1 })
  })

  it('returns undefined when nothing was set', () => {
    expect(createResultMetadataCollector().get()).toBeUndefined()
  })
})

describe('finalizeResultMetadata', () => {
  it('throws a short error and logs the reason when the value cannot become JSON', async () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular

    const { error, warn } = await finalizeFailure(createTool(), circular)

    expect(error).toEqual(notJsonError)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('circular'))
  })

  it('keeps the thrown reason of toJSON out of the error', async () => {
    const value = {
      toJSON: () => {
        throw new Error('secret-token-123')
      },
    }

    const { error, warn } = await finalizeFailure(createTool(), value)

    expect(error).toEqual(notJsonError)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('secret-token-123'),
    )
  })

  it('returns a JSON copy of the value', async () => {
    const value = { at: new Date('2026-01-02T03:04:05.000Z') }
    await expect(finalizeResultMetadata(createTool(), value)).resolves.toEqual({
      at: '2026-01-02T03:04:05.000Z',
    })
  })

  it('drops a tanstack key that toJSON brings back', async () => {
    const value = { a: 1, toJSON: () => ({ a: 1, tanstack: { state: 'x' } }) }
    await expect(finalizeResultMetadata(createTool(), value)).resolves.toEqual({
      a: 1,
    })
  })

  it('throws a short error and logs the details when the value does not match the schema', async () => {
    const tool = createTool(z.object({ count: z.number() }))

    const { error, warn } = await finalizeFailure(tool, { count: 'two' })

    expect(error).toEqual(
      new Error('Result metadata validation failed for tool lookup'),
    )
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('expected number'),
    )
  })

  it('returns the parsed value when the value matches the schema', async () => {
    const tool = createTool(z.object({ count: z.number() }))
    await expect(
      finalizeResultMetadata(tool, { count: 2, extra: true }),
    ).resolves.toEqual({ count: 2 })
  })

  it('throws when a schema transform returns a value that is not JSON', async () => {
    const tool = createTool(
      z.object({ count: z.number() }).transform(({ count }) => ({
        count: BigInt(count),
      })),
    )
    const { error } = await finalizeFailure(tool, { count: 2 })
    expect(error).toEqual(notJsonError)
  })

  it('drops a tanstack key that a schema transform adds', async () => {
    const tool = createTool(
      z.object({ count: z.number() }).transform((value) => ({
        ...value,
        tanstack: { state: 'x' },
      })),
    )
    await expect(finalizeResultMetadata(tool, { count: 2 })).resolves.toEqual({
      count: 2,
    })
  })
})

describe('middlewareResultMetadata', () => {
  it('returns a JSON copy without the tanstack key', () => {
    expect(
      middlewareResultMetadata('lookup', {
        at: new Date('2026-01-02T03:04:05.000Z'),
        tanstack: { state: 'x' },
      }),
    ).toEqual({ at: '2026-01-02T03:04:05.000Z' })
  })

  it('drops metadata that cannot become JSON and logs a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(middlewareResultMetadata('lookup', { id: 1n })).toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()
  })
})

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  createResultMetadataCollector,
  finalizeResultMetadata,
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
  it('throws when the value cannot become JSON', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() => finalizeResultMetadata(createTool(), circular)).toThrow(
      'Result metadata for tool lookup is not JSON: ',
    )
  })

  it('returns a JSON copy of the value', () => {
    const value = { at: new Date('2026-01-02T03:04:05.000Z') }
    expect(finalizeResultMetadata(createTool(), value)).toEqual({
      at: '2026-01-02T03:04:05.000Z',
    })
  })

  it('throws when the value does not match the schema', () => {
    const tool = createTool(z.object({ count: z.number() }))
    expect(() => finalizeResultMetadata(tool, { count: 'two' })).toThrow(
      'Result metadata validation failed for tool lookup: ',
    )
  })

  it('returns the parsed value when the value matches the schema', () => {
    const tool = createTool(z.object({ count: z.number() }))
    expect(finalizeResultMetadata(tool, { count: 2, extra: true })).toEqual({
      count: 2,
    })
  })
})

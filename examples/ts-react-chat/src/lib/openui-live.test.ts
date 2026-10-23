import { describe, expect, it } from 'vitest'
import { describeLiveSourcesForPrompt, getDataSource } from './openui-live'

describe('openui-live', () => {
  it('spendFeed emits a numeric total immediately and tears down', () => {
    const source = getDataSource('spendFeed')
    expect(source).toBeDefined()
    if (!source) return

    const values: Array<unknown> = []
    const cleanup = source.run({ intervalMs: 10 }, (v) => values.push(v))
    cleanup() // stop the interval right away; we only assert the eager first tick

    expect(values.length).toBeGreaterThanOrEqual(1)
    const first = values[0] as { total?: unknown; delta?: unknown }
    expect(typeof first.total).toBe('number')
    expect(typeof first.delta).toBe('number')
  })

  it('returns undefined for an unknown source', () => {
    expect(getDataSource('nope')).toBeUndefined()
  })

  it('catalog lists spendFeed for the prompt', () => {
    expect(describeLiveSourcesForPrompt()).toContain('spendFeed')
  })
})

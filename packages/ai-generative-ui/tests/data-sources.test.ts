import { describe, it, expect, vi } from 'vitest'
import { DataSourceRegistry, describeDataSourcesForPrompt } from '../src/index'

describe('DataSourceRegistry (live data)', () => {
  it('subscribes, emits values, and unsubscribes cleanly', () => {
    const registry = new DataSourceRegistry()
    let push: ((v: unknown) => void) | null = null
    let unsubscribed = false
    registry.register('ticker', (_params, emit) => {
      push = emit
      return () => {
        unsubscribed = true
      }
    })

    const seen: Array<unknown> = []
    const unsubscribe = registry.subscribe('ticker', {}, (v) => seen.push(v))
    expect(push).toBeTypeOf('function')

    push!(1)
    push!(2)
    expect(seen).toEqual([1, 2])

    unsubscribe()
    expect(unsubscribed).toBe(true)
  })

  it('passes params through to the source', () => {
    const registry = new DataSourceRegistry()
    const received: Array<Record<string, any>> = []
    registry.register('s', (params, _emit) => {
      received.push(params)
      return () => {}
    })
    registry.subscribe('s', { currency: 'EUR', intervalMs: 500 }, () => {})
    expect(received[0]).toEqual({ currency: 'EUR', intervalMs: 500 })
  })

  it('gives each subscription its own source invocation (independent state)', () => {
    const registry = new DataSourceRegistry()
    let calls = 0
    registry.register('s', (_p, _e) => {
      calls += 1
      return () => {}
    })
    registry.subscribe('s', {}, () => {})
    registry.subscribe('s', {}, () => {})
    expect(calls).toBe(2)
  })

  it('warns and returns a no-op unsubscribe for an unknown source (forgiving, like compute)', () => {
    const registry = new DataSourceRegistry()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const unsubscribe = registry.subscribe('nope', {}, () => {})
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"nope"'))
    expect(() => unsubscribe()).not.toThrow()
    warn.mockRestore()
  })

  it('lists and describes registered sources for prompting', () => {
    const registry = new DataSourceRegistry()
    registry.register('spendFeed', () => () => {}, {
      description: 'A live spend feed.',
      params: ['currency'],
      output: '{ total, recent }',
    })
    expect(registry.list()).toContain('spendFeed')
    const prompt = describeDataSourcesForPrompt(registry)
    expect(prompt).toContain('spendFeed')
    expect(prompt).toContain('currency')
    expect(prompt).toContain('{ total, recent }')
  })
})

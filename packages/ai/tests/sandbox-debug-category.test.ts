import { describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '../src/logger/resolve'

describe('sandbox debug category', () => {
  it('is enabled by debug: true and disabled by { sandbox: false }', () => {
    expect(resolveDebugOption(true).isEnabled('sandbox')).toBe(true)
    expect(resolveDebugOption({ sandbox: false }).isEnabled('sandbox')).toBe(false)
    expect(resolveDebugOption(false).isEnabled('sandbox')).toBe(false)
  })

  it('sandbox() routes to logger.debug when enabled', () => {
    const debug = vi.fn()
    const logger = { debug, info() {}, warn() {}, error() {} }
    resolveDebugOption({ logger, sandbox: true }).sandbox('watch start', { x: 1 })
    expect(debug).toHaveBeenCalledOnce()
    expect(debug.mock.calls[0]?.[0]).toContain('tanstack-ai:sandbox')
  })
})

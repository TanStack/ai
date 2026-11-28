import { describe, expect, it } from 'vitest'
import { opencodeText } from '../src/index'

describe('opencodeText defaultModelOptions', () => {
  it('stores the defaults on the adapter, not in the adapter config', () => {
    const adapter = opencodeText('anthropic/claude-sonnet-4-5', {
      directory: '/repo',
      defaultModelOptions: { sessionId: 'session-1', directory: '/other' },
    })

    expect(adapter.defaultModelOptions).toEqual({
      sessionId: 'session-1',
      directory: '/other',
    })
    expect(adapter['adapterConfig']).toEqual({ directory: '/repo' })
  })
})

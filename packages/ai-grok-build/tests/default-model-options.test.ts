import { describe, expect, it } from 'vitest'
import { grokBuildText } from '../src/index'

describe('grokBuildText defaultModelOptions', () => {
  it('stores the defaults on the adapter, not in the adapter config', () => {
    const adapter = grokBuildText('grok-build', {
      cwd: '/repo',
      defaultModelOptions: { maxTurns: 3, permissionMode: 'default' },
    })

    expect(adapter.defaultModelOptions).toEqual({
      maxTurns: 3,
      permissionMode: 'default',
    })
    expect(adapter['adapterConfig']).toEqual({ cwd: '/repo' })
  })
})

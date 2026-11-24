import { describe, expect, it } from 'vitest'
import { claudeCodeText } from '../src/index'

describe('claudeCodeText defaultModelOptions', () => {
  it('stores the defaults on the adapter, not in the adapter config', () => {
    const adapter = claudeCodeText('haiku', {
      cwd: '/repo',
      defaultModelOptions: { maxTurns: 3, permissionMode: 'plan' },
    })

    expect(adapter.defaultModelOptions).toEqual({
      maxTurns: 3,
      permissionMode: 'plan',
    })
    expect(adapter['adapterConfig']).toEqual({ cwd: '/repo' })
  })
})

import { describe, expect, it } from 'vitest'
import { codexText } from '../src/index'

describe('codexText defaultModelOptions', () => {
  it('stores the defaults on the adapter, not in the adapter config', () => {
    const adapter = codexText('gpt-5.5-codex', {
      cwd: '/repo',
      defaultModelOptions: { sandboxMode: 'read-only', skipGitRepoCheck: true },
    })

    expect(adapter.defaultModelOptions).toEqual({
      sandboxMode: 'read-only',
      skipGitRepoCheck: true,
    })
    expect(adapter['adapterConfig']).toEqual({ cwd: '/repo' })
  })
})

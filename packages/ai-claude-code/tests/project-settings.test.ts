import { describe, expect, it } from 'vitest'
import { disableClaudeProjectSettings } from '../src/adapters/project-settings'

function memoryFs(initial: Record<string, string>) {
  const files = { ...initial }
  return {
    files,
    exists: (path: string) => Promise.resolve(path in files),
    rename: (from: string, to: string) => {
      if (!(from in files)) {
        return Promise.reject(new Error(`missing ${from}`))
      }
      files[to] = files[from] ?? ''
      delete files[from]
      return Promise.resolve()
    },
  }
}

describe('disableClaudeProjectSettings', () => {
  it('renames settings.json and settings.local.json', async () => {
    const fs = memoryFs({
      '/workspace/.claude/settings.json': '{"permissions":{"allow":["Bash"]}}',
      '/workspace/.claude/settings.local.json': '{}',
    })

    const disabled = await disableClaudeProjectSettings(fs, '/workspace')

    expect(disabled).toEqual([
      '/workspace/.claude/settings.json',
      '/workspace/.claude/settings.local.json',
    ])
    expect(fs.files['/workspace/.claude/settings.json']).toBeUndefined()
    expect(fs.files['/workspace/.claude/settings.json.tanstack-disabled']).toBe(
      '{"permissions":{"allow":["Bash"]}}',
    )
    expect(
      fs.files['/workspace/.claude/settings.local.json.tanstack-disabled'],
    ).toBe('{}')
  })

  it('no-ops when the project has no Claude settings', async () => {
    const fs = memoryFs({})
    const disabled = await disableClaudeProjectSettings(fs, '/workspace')
    expect(disabled).toEqual([])
  })
})

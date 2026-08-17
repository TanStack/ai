import { describe, expect, it } from 'vitest'
import { claudeProjectKey, withTrustDialogAccepted } from '../src/adapters/trust'

describe('withTrustDialogAccepted', () => {
  it('sets hasTrustDialogAccepted on the resolved cwd', () => {
    const next = withTrustDialogAccepted({}, 'C:\\tmp\\repo')
    const key = claudeProjectKey('C:\\tmp\\repo')
    expect(key.includes('\\')).toBe(false)
    const projects = next.projects as Record<string, { hasTrustDialogAccepted: boolean }>
    expect(projects[key]?.hasTrustDialogAccepted).toBe(true)
  })

  it('keeps other project entries', () => {
    const next = withTrustDialogAccepted(
      { projects: { '/other': { hasTrustDialogAccepted: false } } },
      '/tmp/repo',
    )
    const projects = next.projects as Record<string, { hasTrustDialogAccepted: boolean }>
    expect(projects['/other']?.hasTrustDialogAccepted).toBe(false)
    expect(projects[claudeProjectKey('/tmp/repo')]?.hasTrustDialogAccepted).toBe(
      true,
    )
  })
})

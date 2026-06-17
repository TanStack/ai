import { describe, expect, it } from 'vitest'
import {
  matchBridgedToolName,
  resolvePermission,
} from '../src/process/permissions'
import type { OpencodePermissionRequest } from '../src/process/permissions'

function request(
  overrides: Partial<OpencodePermissionRequest> = {},
): OpencodePermissionRequest {
  return {
    id: 'perm-1',
    sessionID: 'sess-1',
    type: 'bash',
    title: 'Run a command',
    ...overrides,
  }
}

describe('matchBridgedToolName', () => {
  const bridged = new Set(['lookup_user'])

  it('returns false without bridged tools', () => {
    expect(
      matchBridgedToolName(request({ type: 'lookup_user' }), undefined),
    ).toBe(false)
    expect(
      matchBridgedToolName(request({ type: 'lookup_user' }), new Set()),
    ).toBe(false)
  })

  it('matches a bare registered tool name in type or title', () => {
    expect(
      matchBridgedToolName(request({ type: 'lookup_user' }), bridged),
    ).toBe(true)
    expect(
      matchBridgedToolName(
        request({ type: 'tool', title: 'lookup_user' }),
        bridged,
      ),
    ).toBe(true)
  })

  it('matches the tanstack_ and tanstack. server prefixes', () => {
    expect(
      matchBridgedToolName(request({ type: 'tanstack_lookup_user' }), bridged),
    ).toBe(true)
    expect(
      matchBridgedToolName(request({ type: 'tanstack.lookup_user' }), bridged),
    ).toBe(true)
  })

  it('does not match foreign tools', () => {
    expect(
      matchBridgedToolName(request({ type: 'github_create_issue' }), bridged),
    ).toBe(false)
  })
})

describe('resolvePermission', () => {
  const bridged = new Set(['lookup_user'])

  it('always allows bridged tools regardless of mode', () => {
    for (const mode of [
      'default',
      'acceptEdits',
      'bypassPermissions',
    ] as const) {
      expect(
        resolvePermission(
          request({ type: 'tanstack_lookup_user' }),
          mode,
          bridged,
        ),
      ).toBe('once')
    }
  })

  it('rejects everything else in default mode', () => {
    expect(
      resolvePermission(request({ type: 'bash' }), 'default', bridged),
    ).toBe('reject')
    expect(
      resolvePermission(request({ type: 'edit' }), 'default', bridged),
    ).toBe('reject')
    expect(
      resolvePermission(request({ type: 'webfetch' }), 'default', bridged),
    ).toBe('reject')
  })

  it('auto-approves file mutations only in acceptEdits mode', () => {
    for (const type of ['edit', 'write', 'patch']) {
      expect(resolvePermission(request({ type }), 'acceptEdits', bridged)).toBe(
        'once',
      )
    }
    expect(
      resolvePermission(request({ type: 'bash' }), 'acceptEdits', bridged),
    ).toBe('reject')
  })

  it('approves everything in bypassPermissions mode', () => {
    expect(
      resolvePermission(
        request({ type: 'bash' }),
        'bypassPermissions',
        bridged,
      ),
    ).toBe('once')
    expect(
      resolvePermission(
        request({ type: 'webfetch' }),
        'bypassPermissions',
        undefined,
      ),
    ).toBe('once')
  })
})

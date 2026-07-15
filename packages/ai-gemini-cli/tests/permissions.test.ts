import { describe, expect, it } from 'vitest'
import { resolvePermission } from '../src/process/permissions'
import type { AcpPermissionRequest } from '../src/stream/acp-types'

function makeRequest(
  overrides: Partial<AcpPermissionRequest['toolCall']> = {},
): AcpPermissionRequest {
  return {
    sessionId: 'sess-1',
    toolCall: {
      toolCallId: 'tc-1',
      title: 'Run shell command',
      kind: 'execute',
      ...overrides,
    },
    options: [
      { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
      { optionId: 'allow-always', name: 'Always allow', kind: 'allow_always' },
      { optionId: 'reject-once', name: 'Reject', kind: 'reject_once' },
    ],
  }
}

describe('resolvePermission', () => {
  it('rejects harness tools in default mode', () => {
    expect(resolvePermission(makeRequest(), 'default', undefined)).toEqual({
      outcome: 'selected',
      optionId: 'reject-once',
    })
  })

  it('allows bridged TanStack tools in every mode', () => {
    const request = makeRequest({
      title: 'lookup_user (tanstack MCP Server)',
      kind: 'other',
    })
    const bridged = new Set(['lookup_user'])
    for (const mode of [
      'default',
      'acceptEdits',
      'bypassPermissions',
    ] as const) {
      expect(resolvePermission(request, mode, bridged)).toEqual({
        outcome: 'selected',
        optionId: 'allow-once',
      })
    }
  })

  it('allows edit-kind tools only in acceptEdits and bypassPermissions', () => {
    const edit = makeRequest({ title: 'Edit file', kind: 'edit' })
    expect(resolvePermission(edit, 'default', undefined)).toEqual({
      outcome: 'selected',
      optionId: 'reject-once',
    })
    expect(resolvePermission(edit, 'acceptEdits', undefined)).toEqual({
      outcome: 'selected',
      optionId: 'allow-once',
    })
    expect(resolvePermission(edit, 'bypassPermissions', undefined)).toEqual({
      outcome: 'selected',
      optionId: 'allow-once',
    })
  })

  it('treats move and delete as edits', () => {
    for (const kind of ['move', 'delete']) {
      expect(
        resolvePermission(makeRequest({ kind }), 'acceptEdits', undefined),
      ).toEqual({ outcome: 'selected', optionId: 'allow-once' })
    }
  })

  it('does not auto-approve execute tools in acceptEdits mode', () => {
    expect(
      resolvePermission(
        makeRequest({ kind: 'execute' }),
        'acceptEdits',
        undefined,
      ),
    ).toEqual({ outcome: 'selected', optionId: 'reject-once' })
  })

  it('allows everything in bypassPermissions mode', () => {
    expect(
      resolvePermission(makeRequest(), 'bypassPermissions', undefined),
    ).toEqual({ outcome: 'selected', optionId: 'allow-once' })
  })

  it('falls back through option kinds and cancels when nothing matches', () => {
    const request: AcpPermissionRequest = {
      ...makeRequest(),
      options: [{ optionId: 'always', name: 'Always', kind: 'allow_always' }],
    }
    expect(resolvePermission(request, 'bypassPermissions', undefined)).toEqual({
      outcome: 'selected',
      optionId: 'always',
    })
    expect(resolvePermission(request, 'default', undefined)).toEqual({
      outcome: 'cancelled',
    })
  })
})

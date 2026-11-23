import { describe, expect, it } from 'vitest'
import { resolveInteractivePermission } from '../src/permissions'
import type { AcpPermissionRequest } from '../src/types/acp-types'

/** An `edit` permission request of the agent for one file. */
function editRequest(path: string): AcpPermissionRequest {
  return {
    sessionId: 'sess-1',
    toolCall: {
      toolCallId: 't1',
      title: 'Edit',
      kind: 'edit',
      locations: [{ path }],
    },
    options: [
      { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
      { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
    ],
  }
}

describe('resolveInteractivePermission', () => {
  it('keys a decision to one action: the same kind, title, and files', () => {
    const approvals = new Map([['probe:tool:edit:Edit:src/a.ts', true]])
    const decide = (path: string) =>
      resolveInteractivePermission(
        editRequest(path),
        'default',
        undefined,
        approvals,
        'probe',
      )
    expect(decide('src/a.ts')).toEqual({
      outcome: { outcome: 'selected', optionId: 'allow' },
    })
    expect(decide('src/b.ts')).toEqual({
      outcome: { outcome: 'selected', optionId: 'reject' },
      approvalId: 'probe:tool:edit:Edit:src/b.ts',
      title: 'Edit',
    })
  })
})

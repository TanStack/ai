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
    const approvals = new Map([
      ['probe:tool:["edit","Edit",["src/a.ts"]]', true],
    ])
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
      approvalId: 'probe:tool:["edit","Edit",["src/b.ts"]]',
      title: 'Edit',
    })
  })

  it('does not collide when a title or path contains a colon', () => {
    const colonTitle = {
      sessionId: 'sess-1',
      toolCall: {
        toolCallId: 't1',
        title: 'Edit:src/a.ts',
        kind: 'edit',
        locations: [{ path: 'src/b.ts' }],
      },
      options: [
        { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
        { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
      ],
    }
    const colonPath = editRequest('src/a.ts')
    colonPath.toolCall.title = 'Edit'
    colonPath.toolCall.locations = [{ path: 'src/a.ts' }, { path: 'src/b.ts' }]
    const first = resolveInteractivePermission(
      colonTitle,
      'default',
      undefined,
      undefined,
      'probe',
    )
    const second = resolveInteractivePermission(
      colonPath,
      'default',
      undefined,
      undefined,
      'probe',
    )
    expect(first.approvalId).toEqual(expect.any(String))
    expect(second.approvalId).toEqual(expect.any(String))
    expect(first.approvalId).not.toBe(second.approvalId)
    const firstId = first.approvalId as string
    const grantedFirst = resolveInteractivePermission(
      colonPath,
      'default',
      undefined,
      new Map([[firstId, true]]),
      'probe',
    )
    expect(grantedFirst).toEqual({
      outcome: { outcome: 'selected', optionId: 'reject' },
      approvalId: second.approvalId,
      title: 'Edit',
    })
    expect(
      resolveInteractivePermission(
        colonTitle,
        'default',
        undefined,
        new Map([[firstId, true]]),
        'probe',
      ),
    ).toEqual({
      outcome: { outcome: 'selected', optionId: 'allow' },
    })
  })
})

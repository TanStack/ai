import { describe, expect, it, vi } from 'vitest'
import {
  applyActivityDeltaToRecords,
  applyActivitySnapshotToRecords,
} from '@tanstack/ai/adapter-internals'
import {
  approvalDecisionActivities,
  approvalId,
  buildApprovalActivity,
  buildApprovalRequestedEvent,
  resolveApproval,
} from '../src/approvals'
import { defineSandboxPolicy } from '../src/policy'
import type { ActivityRecord } from '@tanstack/ai'

describe('approvalId', () => {
  it('is stable for the same action across runs', () => {
    const a = approvalId({
      provider: 'codex',
      kind: 'command',
      target: 'rm -rf x',
    })
    const b = approvalId({
      provider: 'codex',
      kind: 'command',
      target: 'rm -rf x',
    })
    expect(a).toBe(b)
    expect(a).not.toBe(
      approvalId({ provider: 'codex', kind: 'command', target: 'ls' }),
    )
  })
})

describe('resolveApproval', () => {
  const policy = defineSandboxPolicy({
    commands: { allow: ['ls'], ask: ['rm *'], deny: ['sudo *'] },
    capabilities: { fileWrite: 'ask', network: 'deny' },
    default: 'ask',
  })

  it('allows / denies per command policy without asking', () => {
    expect(
      resolveApproval({ policy, approvals: undefined, id: 'x', command: 'ls' }),
    ).toEqual({
      decision: 'allow',
      needsApproval: false,
    })
    expect(
      resolveApproval({
        policy,
        approvals: undefined,
        id: 'x',
        command: 'sudo reboot',
      }),
    ).toEqual({ decision: 'deny', needsApproval: false })
  })

  it('asks (deny + needsApproval) when policy says ask and no decision yet', () => {
    expect(
      resolveApproval({
        policy,
        approvals: undefined,
        id: 'rm',
        command: 'rm file',
      }),
    ).toEqual({ decision: 'deny', needsApproval: true })
  })

  it('honors the client decision on the resumed run', () => {
    const granted = new Map([['rm', true]])
    expect(
      resolveApproval({
        policy,
        approvals: granted,
        id: 'rm',
        command: 'rm file',
      }),
    ).toEqual({ decision: 'allow', needsApproval: false })
    const denied = new Map([['rm', false]])
    expect(
      resolveApproval({
        policy,
        approvals: denied,
        id: 'rm',
        command: 'rm file',
      }),
    ).toEqual({ decision: 'deny', needsApproval: false })
  })

  it('resolves coarse capability rules (fileWrite ask, network deny)', () => {
    expect(
      resolveApproval({
        policy,
        approvals: undefined,
        id: 'w',
        capability: 'fileWrite',
      }),
    ).toEqual({ decision: 'deny', needsApproval: true })
    expect(
      resolveApproval({
        policy,
        approvals: undefined,
        id: 'n',
        capability: 'network',
      }),
    ).toEqual({ decision: 'deny', needsApproval: false })
  })

  it('defaults to ask when no policy', () => {
    expect(
      resolveApproval({
        policy: undefined,
        approvals: undefined,
        id: 'x',
        command: 'anything',
      }),
    ).toEqual({
      decision: 'deny',
      needsApproval: true,
    })
  })

  it('resolves script aliases when matching command policy', () => {
    const scripts = { test: 'pnpm test' }
    const scriptPolicy = defineSandboxPolicy({
      commands: { allow: ['test'] },
      default: 'deny',
    })

    expect(
      resolveApproval({
        policy: scriptPolicy,
        approvals: undefined,
        id: 'test',
        command: 'pnpm test',
        scripts,
      }),
    ).toEqual({ decision: 'allow', needsApproval: false })
  })
})

describe('buildApprovalRequestedEvent', () => {
  it('builds an AG-UI CUSTOM event carrying the approvalId', () => {
    expect(
      buildApprovalRequestedEvent({
        approvalId: 'codex:command:rm -rf x',
        title: 'Run: rm -rf x',
        threadId: 't',
        runId: 'r',
      }),
    ).toMatchObject({
      type: 'CUSTOM',
      name: 'approval-requested',
      value: { approvalId: 'codex:command:rm -rf x' },
    })
  })
})

describe('buildApprovalActivity', () => {
  it('builds a pending sandbox.approval row keyed by the approvalId', () => {
    expect(
      buildApprovalActivity({
        approvalId: 'codex:command:rm -rf x',
        title: 'Run: rm -rf x',
        threadId: 't',
        runId: 'r',
        detail: { toolName: 'Bash' },
      }),
    ).toEqual({
      type: 'ACTIVITY_SNAPSHOT',
      messageId: 'sandbox.approval:codex:command:rm -rf x',
      activityType: 'sandbox.approval',
      content: {
        approvalId: 'codex:command:rm -rf x',
        title: 'Run: rm -rf x',
        status: 'pending',
        detail: { toolName: 'Bash' },
      },
      replace: true,
      timestamp: expect.any(Number),
      metadata: { tanstack: { threadId: 't', runId: 'r' } },
    })
  })
})

/** The delta that sets a row of thread `t` to `status` on run `r2`. */
function statusDelta(messageId: string, status: 'granted' | 'denied') {
  return {
    type: 'ACTIVITY_DELTA',
    messageId,
    activityType: 'sandbox.approval',
    patch: [{ op: 'replace', path: '/status', value: status }],
    timestamp: expect.any(Number),
    metadata: { tanstack: { threadId: 't', runId: 'r2' } },
  }
}

const run2 = { provider: 'claude-code', threadId: 't', runId: 'r2' }

describe('approvalDecisionActivities', () => {
  it('makes one status delta for each decision of the provider only', () => {
    const approvals = new Map([
      ['claude-code:command:rm -rf x', true],
      ['claude-code:fileWrite:Write', false],
      ['codex:command:ls', true],
      // A normal tool approval. Its id is a tool call id.
      ['toolu_1', true],
    ])
    expect(approvalDecisionActivities(approvals, run2)).toEqual([
      statusDelta('sandbox.approval:claude-code:command:rm -rf x', 'granted'),
      statusDelta('sandbox.approval:claude-code:fileWrite:Write', 'denied'),
    ])
  })

  it('makes nothing when the run has no decisions', () => {
    expect(approvalDecisionActivities(undefined, run2)).toEqual([])
  })
})

describe('the sandbox.approval row across runs', () => {
  const pending = buildApprovalActivity({
    approvalId: 'claude-code:command:rm -rf x',
    title: 'Approve Bash: rm -rf x',
    threadId: 't',
    runId: 'r1',
  })

  function grantedDelta() {
    const [delta] = approvalDecisionActivities(
      new Map([['claude-code:command:rm -rf x', true]]),
      run2,
    )
    if (delta === undefined) throw new Error('expected one decision delta')
    return delta
  }

  it('a decision on a later run sets the status of the pending row', () => {
    const records = applyActivityDeltaToRecords(
      applyActivitySnapshotToRecords([], pending, 0),
      grantedDelta(),
    )
    expect(records.map(({ id, content }) => ({ id, content }))).toEqual([
      {
        id: 'sandbox.approval:claude-code:command:rm -rf x',
        content: {
          approvalId: 'claude-code:command:rm -rf x',
          title: 'Approve Bash: rm -rf x',
          status: 'granted',
        },
      },
    ])
  })

  it('a decision for an approval with no row changes nothing', () => {
    // A decision made before the row existed. The core warns once.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const records: Array<ActivityRecord> = [
      {
        id: 'sandbox-r1',
        activityType: 'sandbox.status',
        content: { status: 'ready', provider: 'local-process' },
        index: 0,
      },
    ]
    expect(applyActivityDeltaToRecords(records, grantedDelta())).toEqual([
      {
        id: 'sandbox-r1',
        activityType: 'sandbox.status',
        content: { status: 'ready', provider: 'local-process' },
        index: 0,
      },
    ])
    warn.mockRestore()
  })
})

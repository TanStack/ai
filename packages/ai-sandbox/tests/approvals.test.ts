import { describe, expect, it } from 'vitest'
import {
  APPROVAL_REQUESTED_EVENT,
  approvalId,
  buildApprovalRequestedEvent,
  resolveApproval,
} from '../src/approvals'
import { defineSandboxPolicy } from '../src/policy'

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
    const event = buildApprovalRequestedEvent({
      approvalId: 'codex:command:rm -rf x',
      title: 'Run: rm -rf x',
      threadId: 't',
      runId: 'r',
    }) as { type: string; name: string; value: { approvalId: string } }
    expect(event.type).toBe('CUSTOM')
    expect(event.name).toBe(APPROVAL_REQUESTED_EVENT)
    expect(event.value.approvalId).toBe('codex:command:rm -rf x')
  })
})

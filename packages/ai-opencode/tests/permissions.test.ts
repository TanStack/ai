import { describe, expect, it, vi } from 'vitest'
import { CapabilityRegistry, EventType } from '@tanstack/ai'
import { provideSandbox } from '@tanstack/ai-sandbox'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { opencodeText } from '../src/index'
import {
  matchBridgedToolName,
  resolveInteractivePermission,
  resolvePermission,
} from '../src/process/permissions'
import type {
  AdapterYieldChunk,
  CapabilityContext,
  ModelMessage,
} from '@tanstack/ai'
import type { SandboxHandle } from '@tanstack/ai-sandbox'
import type { OpencodePermissionRequest } from '../src/process/permissions'
import type { StartOpencodeSessionOptions } from '../src/process/server'

vi.mock('../src/process/sandbox-server', () => ({
  startOpencodeServerInSandbox: () =>
    Promise.resolve({
      baseUrl: 'http://127.0.0.1:1',
      dispose: () => Promise.resolve(),
    }),
}))
/** The prompt text of each turn that the fake session got. */
const prompts = vi.hoisted((): Array<string> => [])

// The agent asks once to run a shell command, then ends its turn.
vi.mock('../src/process/server', () => ({
  startOpencodeSession: (options: StartOpencodeSessionOptions) =>
    Promise.resolve({
      sessionId: 'sess-1',
      resumed: false,
      prompt: async (text: string) => {
        prompts.push(text)
        await options.onPermissionRequest({
          id: 'perm-1',
          sessionID: 'sess-1',
          type: 'bash',
          title: 'Run rm -rf build',
        })
        return {
          message: { id: 'msg-1', role: 'assistant', finish: 'stop' },
          text: 'done',
        }
      },
      abort: () => Promise.resolve(),
      dispose: () => Promise.resolve(),
    }),
}))

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

// The server start is mocked, so the adapter never uses the sandbox.
const unused = () => Promise.reject(new Error('unused in this test'))
const sandbox: SandboxHandle = {
  id: 'sbx',
  provider: 'mock',
  capabilities: {
    fs: false,
    exec: false,
    env: false,
    ports: false,
    backgroundProcesses: false,
    writableStdin: false,
    killableProcesses: false,
    snapshots: false,
    networkPolicy: false,
    durableFilesystem: false,
    fork: false,
  },
  fs: {
    read: unused,
    readBytes: unused,
    write: unused,
    list: unused,
    mkdir: unused,
    remove: unused,
    rename: unused,
    exists: unused,
  },
  git: {
    clone: unused,
    status: unused,
    add: unused,
    commit: unused,
    push: unused,
    pull: unused,
    branch: unused,
  },
  process: { exec: unused, spawn: unused },
  ports: { connect: unused },
  env: { set: unused },
  destroy: () => Promise.resolve(),
}

/** Run one turn of the mocked agent in the default permission mode. */
async function runOpencode(
  approvals?: ReadonlyMap<string, boolean>,
  messages: Array<ModelMessage> = [{ role: 'user', content: 'clean up' }],
) {
  const capabilities: CapabilityContext = {
    capabilities: new CapabilityRegistry(),
  }
  provideSandbox(capabilities, sandbox)
  const chunks: Array<AdapterYieldChunk> = []
  for await (const chunk of opencodeText(
    'anthropic/claude-sonnet-4-5',
  ).chatStream({
    threadId: 'thread-1',
    runId: 'run-1',
    model: 'anthropic/claude-sonnet-4-5',
    messages,
    logger: resolveDebugOption(false),
    capabilities,
    ...(approvals !== undefined && { approvals }),
  })) {
    chunks.push(chunk)
  }
  return chunks
}

describe('resolveInteractivePermission', () => {
  it('keys a decision to one action, not to the whole permission type', () => {
    const approvals = new Map([['opencode:tool:bash:pnpm install', true]])
    const decide = (title: string) =>
      resolveInteractivePermission(
        request({ title }),
        'default',
        undefined,
        approvals,
      )
    expect(decide('pnpm install')).toEqual({ response: 'once' })
    expect(decide('rm -rf build')).toEqual({
      response: 'reject',
      approvalId: 'opencode:tool:bash:rm -rf build',
      title: 'rm -rf build',
    })
  })
})

describe('opencode sandbox.approval activity', () => {
  it('sends a pending row right after the approval-requested event', async () => {
    const chunks = await runOpencode()
    expect(
      chunks.some(
        (chunk) =>
          chunk.type === EventType.CUSTOM &&
          chunk.name === 'approval-requested',
      ),
    ).toBe(true)
    expect(chunks).toEqual(
      expect.arrayContaining([
        {
          type: 'ACTIVITY_SNAPSHOT',
          messageId: 'sandbox.approval:opencode:tool:bash:Run rm -rf build',
          activityType: 'sandbox.approval',
          content: {
            approvalId: 'opencode:tool:bash:Run rm -rf build',
            title: 'Run rm -rf build',
            status: 'pending',
            detail: { provider: 'opencode' },
          },
          replace: true,
          timestamp: expect.any(Number),
          metadata: {
            tanstack: {
              model: 'anthropic/claude-sonnet-4-5',
              threadId: 'thread-1',
              runId: 'run-1',
            },
          },
        },
      ]),
    )
  })

  it('sets the row to denied right after RUN_STARTED on the next run', async () => {
    const chunks = await runOpencode(
      new Map([['opencode:tool:bash:Run rm -rf build', false]]),
    )
    expect(chunks.slice(0, 2)).toEqual([
      expect.objectContaining({ type: 'RUN_STARTED' }),
      {
        type: 'ACTIVITY_DELTA',
        messageId: 'sandbox.approval:opencode:tool:bash:Run rm -rf build',
        activityType: 'sandbox.approval',
        patch: [{ op: 'replace', path: '/status', value: 'denied' }],
        timestamp: expect.any(Number),
        metadata: {
          tanstack: { threadId: 'thread-1', runId: 'run-1' },
        },
      },
    ])
  })

  it('yields the pending row when the permission callback runs', async () => {
    const chunks = await runOpencode()
    const snapshot = chunks.findIndex(
      (chunk) =>
        chunk.type === EventType.ACTIVITY_SNAPSHOT &&
        chunk.activityType === 'sandbox.approval',
    )
    const finished = chunks.findIndex(
      (chunk) => chunk.type === EventType.RUN_FINISHED,
    )
    expect(snapshot).toBeGreaterThan(-1)
    expect(finished).toBeGreaterThan(-1)
    expect(snapshot).toBeLessThan(finished)
  })

  // `respondToSandboxApproval` starts a run with no new user message.
  it('continues a run that only answers an approval', async () => {
    prompts.length = 0
    const chunks = await runOpencode(
      new Map([['opencode:tool:bash:Run rm -rf build', true]]),
      [
        { role: 'user', content: 'clean up' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'bash', arguments: '{}' },
            },
          ],
        },
        { role: 'tool', toolCallId: 'call-1', content: 'rejected' },
      ],
    )
    expect(
      chunks.find((chunk) => chunk.type === EventType.RUN_ERROR),
    ).toBeUndefined()
    expect(prompts.at(-1)).toContain(
      'The user answered your approval requests. Continue the task.',
    )
  })
})

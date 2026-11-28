/**
 * The `sandbox.approval` activity of the Claude Code adapter.
 *
 * A fake `claude` CLI runs one empty turn in a real local-process sandbox. A
 * fake tool-bridge provisioner stands in for the bridge: it calls the
 * permission-prompt tool once, the way `claude` does before it runs a command.
 */
import { afterAll, describe, expect, it } from 'vitest'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { EventType } from '@tanstack/ai'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import {
  defineSandboxPolicy,
  provideSandboxPolicy,
  provideToolBridgeProvisioner,
} from '@tanstack/ai-sandbox'
import { claudeCodeText } from '../src/index'
import { capabilityContextWith, noopLogger } from './fakes'
import type { AdapterYieldChunk, ModelMessage } from '@tanstack/ai'
import type { ToolBridgeProvisioner } from '@tanstack/ai-sandbox'

const baseDir = path.join(os.tmpdir(), `tanstack-ai-cc-approval-${Date.now()}`)
const provider = localProcessSandbox({ baseDir, removeOnDestroy: true })

afterAll(async () => {
  await fsp.rm(baseDir, { recursive: true, force: true })
})

// A stand-in for the `claude` CLI: reads the prompt, keeps a copy of it in
// `input.txt`, then ends the turn.
const FAKE_CLAUDE = [
  `import { writeFileSync } from 'node:fs'`,
  `let input = ''`,
  `process.stdin.on('data', (d) => { input += d })`,
  `process.stdin.on('end', () => {`,
  `  writeFileSync('input.txt', input)`,
  `  const w = (o) => process.stdout.write(JSON.stringify(o) + '\\n')`,
  `  w({ type: 'system', subtype: 'init', session_id: 'sess-1', model: 'haiku', tools: [] })`,
  `  w({ type: 'result', subtype: 'success', result: 'done', usage: { input_tokens: 1, output_tokens: 1 } })`,
  `})`,
].join('\n')

/** Asks once to run `rm -rf build`, then returns a bridge nothing calls. */
const askingProvisioner: ToolBridgeProvisioner = {
  async provision(_tools, options) {
    await options.permission?.resolve({
      tool_name: 'Bash',
      input: { command: 'rm -rf build' },
    })
    return {
      name: 'tanstack',
      url: 'http://127.0.0.1:1/mcp',
      token: 'token',
      close: () => Promise.resolve(),
    }
  },
}

/** The stdin of the fake `claude` CLI in the last run. */
let lastInput = ''

/** Run one turn under a policy that asks before every action. */
async function runClaude(
  approvals?: ReadonlyMap<string, boolean>,
  messages: Array<ModelMessage> = [{ role: 'user', content: 'clean up' }],
) {
  const sbx = await provider.create({})
  await sbx.fs.write('/workspace/fake-claude.mjs', FAKE_CLAUDE)
  const capabilities = capabilityContextWith(sbx)
  provideSandboxPolicy(capabilities, defineSandboxPolicy({ default: 'ask' }))
  provideToolBridgeProvisioner(capabilities, askingProvisioner)
  const adapter = claudeCodeText('haiku', {
    claudeExecutable: 'node fake-claude.mjs',
    emitDiff: false,
  })
  const chunks: Array<AdapterYieldChunk> = []
  for await (const chunk of adapter.chatStream({
    threadId: 'thread-1',
    runId: 'run-1',
    model: 'haiku',
    messages,
    logger: noopLogger,
    capabilities,
    ...(approvals !== undefined && { approvals }),
  })) {
    chunks.push(chunk)
  }
  lastInput = (await sbx.fs.exists('/workspace/input.txt'))
    ? await sbx.fs.read('/workspace/input.txt')
    : ''
  await sbx.destroy()
  return chunks
}

describe('claude-code sandbox.approval activity', () => {
  it('sends a pending row right after the approval-requested event', async () => {
    const chunks = await runClaude()
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
          messageId: 'sandbox.approval:claude-code:command:rm -rf build',
          activityType: 'sandbox.approval',
          content: {
            approvalId: 'claude-code:command:rm -rf build',
            title: 'Approve Bash: rm -rf build',
            status: 'pending',
            detail: { provider: 'claude-code', toolName: 'Bash' },
          },
          replace: true,
          timestamp: expect.any(Number),
          metadata: {
            tanstack: { model: 'haiku', threadId: 'thread-1', runId: 'run-1' },
          },
        },
      ]),
    )
  })

  it('sets the row to granted right after RUN_STARTED on the next run', async () => {
    const chunks = await runClaude(
      new Map([['claude-code:command:rm -rf build', true]]),
    )
    expect(chunks.slice(0, 2)).toEqual([
      expect.objectContaining({ type: 'RUN_STARTED' }),
      {
        type: 'ACTIVITY_DELTA',
        messageId: 'sandbox.approval:claude-code:command:rm -rf build',
        activityType: 'sandbox.approval',
        patch: [{ op: 'replace', path: '/status', value: 'granted' }],
        timestamp: expect.any(Number),
        metadata: {
          tanstack: { threadId: 'thread-1', runId: 'run-1' },
        },
      },
    ])
  })

  it('yields the pending row when the permission callback runs', async () => {
    const chunks = await runClaude()
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
    const chunks = await runClaude(
      new Map([['claude-code:command:rm -rf build', true]]),
      [
        { role: 'user', content: 'clean up' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'Bash', arguments: '{}' },
            },
          ],
        },
        { role: 'tool', toolCallId: 'call-1', content: 'denied' },
      ],
    )
    expect(
      chunks.find((chunk) => chunk.type === EventType.RUN_ERROR),
    ).toBeUndefined()
    expect(lastInput).toContain(
      'The user answered your approval requests. Continue the task.',
    )
  })
})

/**
 * Gated live smoke test for the Claude Code harness adapter.
 *
 * The standard e2e matrix mocks providers with aimock via per-test
 * `X-Test-Id` header isolation. Claude Code spawns its bundled runtime as a
 * subprocess, so that isolation can't be injected — this adapter is excluded
 * from the matrix and covered here instead, gated behind CLAUDE_CODE_E2E.
 *
 * Run with:
 *   CLAUDE_CODE_E2E=1 ANTHROPIC_API_KEY=sk-... \
 *     pnpm --filter @tanstack/ai-e2e test:e2e -- --grep "claude-code"
 *
 * (A local `claude login` works in place of ANTHROPIC_API_KEY.)
 */
import { expect, test } from '@playwright/test'
import { chat } from '@tanstack/ai'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { defineSandbox, withSandbox } from '@tanstack/ai-sandbox'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import type { StreamChunk } from '@tanstack/ai'

const sandbox = defineSandbox({
  id: 'claude-code-e2e',
  provider: localProcessSandbox(),
  workspace: {
    source: { type: 'none' },
    instructions: 'Claude Code streaming smoke test workspace.',
  },
  lifecycle: { reuse: 'none', snapshot: 'none', destroyOnComplete: true },
  fileEvents: false,
})

test.describe('claude-code harness (gated live smoke)', () => {
  test.skip(
    !process.env.CLAUDE_CODE_E2E,
    'Set CLAUDE_CODE_E2E=1 (plus ANTHROPIC_API_KEY or a local Claude login) to run the Claude Code live smoke test',
  )

  test('streams a full harness turn with session id and stop finish', async () => {
    test.setTimeout(180_000)

    const chunks: Array<StreamChunk> = []
    const stream = chat({
      adapter: claudeCodeText('haiku', {
        maxTurns: 2,
        // Read-only smoke: the default permission policy denies anything
        // that would prompt, and no tools are bridged.
        disallowedTools: ['Bash', 'Write', 'Edit'],
      }),
      middleware: [withSandbox(sandbox)],
      messages: [
        {
          role: 'user',
          content: 'Reply with exactly the word: pong',
        },
      ],
    })

    for await (const chunk of stream) {
      chunks.push(chunk)
    }

    const types = chunks.map((chunk) => chunk.type as string)
    expect(types[0]).toBe('RUN_STARTED')

    const sessionEvent = chunks.find(
      (chunk) =>
        chunk.type === 'CUSTOM' &&
        (chunk as { name?: string }).name === 'claude-code.session-id',
    )
    expect(sessionEvent).toBeDefined()
    expect(
      (sessionEvent as { value: { sessionId: string } }).value.sessionId,
    ).toMatch(/.+/)

    const finished = chunks.find((chunk) => chunk.type === 'RUN_FINISHED')
    expect(finished).toBeDefined()
    expect((finished as { finishReason?: string }).finishReason).toBe('stop')

    const text = chunks
      .filter((chunk) => chunk.type === 'TEXT_MESSAGE_CONTENT')
      .map((chunk) => (chunk as { delta?: string }).delta ?? '')
      .join('')
    expect(text.toLowerCase()).toContain('pong')
  })

  test('streams tool-call argument deltas', async () => {
    test.setTimeout(180_000)

    const filePath = 'AGENTS.md'
    const chunks: Array<StreamChunk> = []
    const stream = chat({
      adapter: claudeCodeText('haiku', {
        maxTurns: 2,
        allowedTools: ['Read'],
        disallowedTools: ['Bash', 'Write', 'Edit'],
      }),
      middleware: [withSandbox(sandbox)],
      messages: [
        {
          role: 'user',
          content: `Use the Read tool exactly once to read ${filePath}.`,
        },
      ],
    })

    for await (const chunk of stream) chunks.push(chunk)

    const start = chunks.find(
      (chunk) =>
        chunk.type === 'TOOL_CALL_START' && chunk.toolCallName === 'Read',
    )
    expect(start).toBeDefined()

    const args = chunks.filter(
      (chunk) =>
        chunk.type === 'TOOL_CALL_ARGS' &&
        chunk.toolCallId === start?.toolCallId,
    )
    expect(args.length).toBeGreaterThan(0)
    expect(args.every((chunk) => !('args' in chunk))).toBe(true)
    expect(args.map((chunk) => chunk.delta).join('')).toContain(filePath)

    const endIndex = chunks.findIndex(
      (chunk) =>
        chunk.type === 'TOOL_CALL_END' &&
        chunk.toolCallId === start?.toolCallId,
    )
    expect(endIndex).toBeGreaterThan(chunks.indexOf(args[0]))
  })
})

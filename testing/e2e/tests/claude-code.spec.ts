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
import { z } from 'zod'
import { chat } from '@tanstack/ai'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import type { StreamChunk } from '@tanstack/ai'

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

  test('produces schema-constrained structured output', async () => {
    test.setTimeout(180_000)

    const result = await chat({
      adapter: claudeCodeText('haiku', {
        maxTurns: 2,
        disallowedTools: ['Bash', 'Write', 'Edit'],
      }),
      messages: [
        {
          role: 'user',
          content:
            'Return the capital of France and its population (approximate).',
        },
      ],
      outputSchema: z.object({
        capital: z.string(),
        population: z.number(),
      }),
    })

    // `chat({ outputSchema })` (non-stream) resolves to the validated object
    // directly (Promise<T>) — no cast, no `.object` wrapper.
    expect(result.capital.toLowerCase()).toContain('paris')
    expect(typeof result.population).toBe('number')
  })
})

/**
 * Regression tests for multimodal tool-result support (#363).
 *
 * When a server tool returns an Array<ContentPart> (e.g. an image), chat()
 * must preserve it as-is all the way to the adapter so the adapter can send
 * a structured, multi-part tool_result instead of a JSON string. The code
 * path under test is `buildToolResultChunks` in
 * `packages/ai/src/activities/chat/index.ts`, which now calls
 * `normalizeToolResult(result.result)` instead of `JSON.stringify(result.result)`.
 */

import { describe, expect, it, vi } from 'vitest'
import { chat } from '../src/activities/chat/index'
import type { StreamChunk } from '../src/types'
import { ev, createMockAdapter, collectChunks, serverTool } from './test-utils'

// ---------------------------------------------------------------------------
// Shared ContentPart fixture used across tests
// ---------------------------------------------------------------------------
const MULTIMODAL_RESULT = [
  { type: 'text' as const, content: 'screenshot' },
  {
    type: 'image' as const,
    source: { type: 'url' as const, value: 'https://x/y.png' },
  },
]

// ---------------------------------------------------------------------------
// Helper: drive chat() through one tool iteration + one final text iteration
// and return the `role:'tool'` ModelMessage seen by the adapter on call #2.
// ---------------------------------------------------------------------------
async function runWithToolAndCapture(
  executeFn: () => unknown,
): Promise<{ role: string; content: unknown; toolCallId?: string }> {
  const { adapter, calls } = createMockAdapter({
    iterations: [
      // Iteration 1: adapter emits a single tool call
      [
        ev.runStarted(),
        ev.toolStart('call_mm', 'screenshotTool'),
        ev.toolArgs('call_mm', '{}'),
        ev.runFinished('tool_calls'),
      ],
      // Iteration 2: adapter produces final text
      [
        ev.runStarted(),
        ev.textStart(),
        ev.textContent('Done.'),
        ev.textEnd(),
        ev.runFinished('stop'),
      ],
    ],
  })

  const stream = chat({
    adapter,
    messages: [{ role: 'user', content: 'Take a screenshot' }],
    tools: [serverTool('screenshotTool', executeFn)],
  })

  await collectChunks(stream as AsyncIterable<StreamChunk>)

  // The adapter must have been called twice
  expect(calls).toHaveLength(2)

  // Find the tool-result message in the second call's message list
  const secondCallMessages = calls[1]!.messages as Array<{
    role: string
    content: unknown
    toolCallId?: string
  }>
  const toolMsg = secondCallMessages.find(
    (m) => m.role === 'tool' && m.toolCallId === 'call_mm',
  )
  expect(toolMsg).toBeDefined()
  return toolMsg!
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('multimodal tool-result support (#363)', () => {
  describe('ContentPart[] return value', () => {
    it('preserves a ContentPart[] as an array in the tool message (not JSON-stringified)', async () => {
      const executeSpy = vi.fn().mockReturnValue(MULTIMODAL_RESULT)

      const toolMsg = await runWithToolAndCapture(executeSpy)

      // The content MUST be an array, not a string
      expect(Array.isArray(toolMsg.content)).toBe(true)

      // And it must equal the original ContentPart[] returned by the tool
      expect(toolMsg.content).toEqual(MULTIMODAL_RESULT)
    })

    it('content is NOT a JSON string when tool returns ContentPart[]', async () => {
      const executeSpy = vi.fn().mockReturnValue(MULTIMODAL_RESULT)

      const toolMsg = await runWithToolAndCapture(executeSpy)

      // The buggy behaviour was: JSON.stringify([{ type:'text', content:'screenshot' }, ...])
      // Guard against regression by asserting the type is explicitly NOT string.
      expect(typeof toolMsg.content).not.toBe('string')
    })
  })

  describe('plain object return value (unchanged behaviour)', () => {
    it('stringifies a plain object to JSON in the tool message', async () => {
      const executeSpy = vi.fn().mockReturnValue({ ok: true })

      const toolMsg = await runWithToolAndCapture(executeSpy)

      // Plain objects must still be JSON-stringified (existing behaviour)
      expect(typeof toolMsg.content).toBe('string')
      expect(toolMsg.content).toBe('{"ok":true}')
    })
  })

  describe('TOOL_CALL_RESULT stream chunk', () => {
    it('emits string content on the wire event (AG-UI spec) while the message keeps the array', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('call_mm2', 'screenshotTool'),
            ev.toolArgs('call_mm2', '{}'),
            ev.runFinished('tool_calls'),
          ],
          [
            ev.runStarted(),
            ev.textStart(),
            ev.textContent('Done.'),
            ev.textEnd(),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Take a screenshot' }],
        tools: [serverTool('screenshotTool', () => MULTIMODAL_RESULT)],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Locate the TOOL_CALL_RESULT chunk for our tool call
      const resultChunk = chunks.find(
        (c) =>
          c.type === 'TOOL_CALL_RESULT' && (c as any).toolCallId === 'call_mm2',
      ) as any

      expect(resultChunk).toBeDefined()
      // AG-UI TOOL_CALL_RESULT.content is string-only: the wire event carries
      // the JSON-stringified array, NOT the array itself. The structured array
      // travels on the tool ModelMessage (asserted above), which is what the
      // next adapter iteration converts into a multimodal provider request.
      expect(typeof resultChunk.content).toBe('string')
      expect(resultChunk.content).toBe(JSON.stringify(MULTIMODAL_RESULT))
    })
  })
})

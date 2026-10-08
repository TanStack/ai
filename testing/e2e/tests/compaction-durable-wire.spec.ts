import { z } from 'zod'
import type { APIRequestContext } from '@playwright/test'
import { test, expect } from './fixtures'

const STUB = '[tool output cleared'

const Message = z.object({
  role: z.string(),
  content: z.unknown(),
  toolCallId: z.string().optional(),
})

const Result = z.object({
  ok: z.literal(true),
  calls: z.number(),
  summaryCalls: z.number(),
  texts: z.array(z.string()),
  transcript: z.array(Message),
  rebuilt: z.array(Message),
  records: z.array(z.string()),
  lastRequest: z.object({
    input: z.array(z.record(z.string(), z.unknown())),
  }),
})

const Failed = z.object({
  ok: z.literal(false),
  error: z.string(),
  calls: z.number(),
  records: z.array(z.string()),
  lastRequest: z.unknown(),
})

test.describe('compaction: durable records in a harness session', () => {
  test('an empty summary keeps the history, and the overflow error fails the turn', async ({
    request,
  }) => {
    const response = await request.post('/api/compaction-durable-wire', {
      data: { case: 'empty-summary-overflow' },
    })
    expect(response.ok()).toBe(true)
    const json: unknown = await response.json()
    const result = Failed.parse(json)

    expect(result.error).toContain('exceeds the context window')
    expect(result.calls).toBe(4)
    expect(result.records).toEqual([])
    // The retry got the whole history, not an empty summary.
    const sent = JSON.stringify(result.lastRequest)
    expect(sent).toContain('First response.')
    expect(sent).not.toContain('untrusted-conversation-summary')
  })

  async function run(request: APIRequestContext, testCase: string) {
    const response = await request.post('/api/compaction-durable-wire', {
      data: { case: testCase },
    })
    expect(response.ok()).toBe(true)
    const json: unknown = await response.json()
    return Result.parse(json)
  }

  test('the after-turn check compacts a silent overflow', async ({
    request,
  }) => {
    const result = await run(request, 'silent-overflow')
    expect(result.texts).toEqual(['First response.', 'Completed response.'])
    expect(result.calls).toBe(3)
    expect(result.records).toEqual(['after-turn'])
    expect(result.rebuilt).toEqual(result.transcript)
  })

  test('an overflow error compacts and retries once', async ({ request }) => {
    const result = await run(request, 'error-overflow')
    expect(result.texts).toEqual(['First response.', 'Recovered response.'])
    expect(result.calls).toBe(4)
    expect(result.records).toEqual(['forced'])
    expect(result.rebuilt).toEqual(result.transcript)
  })

  test('turn control calls compactNext and retries', async ({ request }) => {
    const result = await run(request, 'turn-control')
    expect(result.texts).toEqual(['a1', 'fits now'])
    expect(result.calls).toBe(4)
    expect(result.records).toEqual(['forced'])
    expect(result.rebuilt).toEqual(result.transcript)
  })

  test('parallel tools: only the oldest result is cleared', async ({
    request,
  }) => {
    const result = await run(request, 'parallel-tools')
    expect(result.texts).toEqual(['All parts read.'])
    expect(result.calls).toBe(2)
    expect(result.records).toEqual(['threshold'])
    expect(result.transcript).toHaveLength(7)
    expect(result.rebuilt).toEqual(result.transcript)

    const tools = result.transcript.filter((m) => m.role === 'tool')
    expect(tools.map((m) => m.toolCallId)).toEqual([
      'call_part_1',
      'call_part_2',
      'call_part_3',
      'call_part_4',
    ])
    expect(String(tools[0]?.content)).toContain(STUB)
    tools.slice(1).forEach((m, index) => {
      expect(String(m.content)).toContain(`RESULT_${index + 2}`)
    })

    const outputs = result.lastRequest.input.filter(
      (item) => item.type === 'function_call_output',
    )
    expect(outputs.map((item) => item.call_id)).toEqual([
      'call_part_1',
      'call_part_2',
      'call_part_3',
      'call_part_4',
    ])
    expect(String(outputs[0]?.output)).toContain(STUB)
  })

  test('a background summary is ready before the hard limit, and the next turn sends it', async ({
    request,
  }) => {
    const result = await run(request, 'background')
    expect(result.texts).toEqual([
      'First response.',
      'Second response.',
      'Third response.',
    ])
    expect(result.calls).toBe(3)
    // One summary call, beside the second turn. No turn went over maxTokens,
    // so there is no inline (threshold) record.
    expect(result.summaryCalls).toBe(1)
    expect(result.records).toEqual(['background'])
    expect(result.rebuilt).toEqual(result.transcript)

    // The third turn's request carries the summary, not the first prompt.
    const sent = JSON.stringify(result.lastRequest)
    expect(sent).toContain('untrusted-conversation-summary')
    expect(sent).toContain('Earlier: a long first prompt.')
    expect(sent).not.toContain('OLD_DETAIL')
  })
})

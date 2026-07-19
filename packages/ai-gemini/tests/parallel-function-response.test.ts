import { describe, expect, it } from 'vitest'
import { GeminiTextAdapter } from '../src/adapters/text'
import type { ModelMessage } from '@tanstack/ai'
import type { Content } from '@google/genai'

// `formatMessages` is `private` on the adapter (TS2341 blocks subclass access,
// so the Probe pattern used in ai-bedrock/tests for `protected` hooks doesn't
// apply here). Cast through `unknown` to a minimal shape — keeps the test
// type-safe without widening the adapter's public API surface just to make a
// private method testable.
type WithFormatMessages = {
  formatMessages: (messages: Array<ModelMessage>) => Array<Content>
}

const adapter = new GeminiTextAdapter(
  { apiKey: 'not-used' },
  'gemini-2.5-flash-lite',
)

const format = (messages: Array<ModelMessage>): Array<Content> =>
  (adapter as unknown as WithFormatMessages).formatMessages(messages)

function functionResponseIds(out: Array<Content>): Array<string> {
  // `Content.parts` is `Part[] | undefined`; once narrowed past the `?? []`
  // each `Part` is a discriminated union keyed by which optional field it
  // carries. Filtering on `'functionResponse' in p` is enough to land us on
  // the right arm at runtime; cast through to read the id.
  return out
    .flatMap((c) => c.parts ?? [])
    .filter((p) => 'functionResponse' in p)
    .map(
      (p) =>
        (p as { functionResponse?: { id?: string } }).functionResponse?.id ??
        '',
    )
}

describe('GeminiTextAdapter — parallel functionResponse dedup (#894)', () => {
  it('keeps both responses when two parallel calls share a tool name but have distinct ids', () => {
    // Repro straight from the issue: same-tool parallel calls, distinct ids.
    // Pre-fix the dedup keyed on `.name` and dropped the second response,
    // making the next Gemini request 400 with "function response/call part
    // count mismatch".
    const messages: Array<ModelMessage> = [
      { role: 'user', content: 'log 50 USD and 30 EUR' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'lookupCurrency', arguments: '{"query":"USD"}' },
          },
          {
            id: 'call_2',
            type: 'function',
            function: { name: 'lookupCurrency', arguments: '{"query":"EUR"}' },
          },
        ],
      },
      { role: 'tool', toolCallId: 'call_1', content: 'USD -> US Dollar' },
      { role: 'tool', toolCallId: 'call_2', content: 'EUR -> Euro' },
    ]

    const out = format(messages)
    const ids = functionResponseIds(out)

    expect(ids).toEqual(['call_1', 'call_2'])
  })

  it('drops a genuine duplicate functionResponse (same id reappears)', () => {
    // The dedup still has to collapse a real duplicate — e.g. a caller that
    // re-sends the same toolCallId's result. Keying on `.id` keeps this
    // guarantee intact while letting same-name parallel calls through.
    const messages: Array<ModelMessage> = [
      { role: 'user', content: 'lookup USD' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'lookupCurrency', arguments: '{"query":"USD"}' },
          },
        ],
      },
      { role: 'tool', toolCallId: 'call_1', content: 'USD -> US Dollar' },
      // Accidental re-send of the same toolCallId.
      { role: 'tool', toolCallId: 'call_1', content: 'USD -> US Dollar' },
    ]

    const out = format(messages)
    const ids = functionResponseIds(out)

    expect(ids).toEqual(['call_1'])
  })

  it('keeps both responses when the parallel calls use different tool names', () => {
    // Different names AND different ids — both old and new code keep these,
    // so this is a regression guard against an overzealous "dedup by id" fix
    // that might accidentally drop by name as well.
    const messages: Array<ModelMessage> = [
      { role: 'user', content: 'lookup USD and log it' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'lookupCurrency', arguments: '{"query":"USD"}' },
          },
          {
            id: 'call_2',
            type: 'function',
            function: { name: 'logMessage', arguments: '{"msg":"hi"}' },
          },
        ],
      },
      { role: 'tool', toolCallId: 'call_1', content: 'USD -> US Dollar' },
      { role: 'tool', toolCallId: 'call_2', content: 'logged' },
    ]

    const out = format(messages)
    const ids = functionResponseIds(out)

    expect(ids).toEqual(['call_1', 'call_2'])
  })

  it('keeps all three responses when three parallel calls share a tool name', () => {
    // Stress the dedup with 3 same-name parallel calls — pre-fix this would
    // collapse to a single response, after the fix all three survive.
    const messages: Array<ModelMessage> = [
      { role: 'user', content: 'log USD EUR GBP' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'lookupCurrency', arguments: '{"query":"USD"}' },
          },
          {
            id: 'call_2',
            type: 'function',
            function: { name: 'lookupCurrency', arguments: '{"query":"EUR"}' },
          },
          {
            id: 'call_3',
            type: 'function',
            function: { name: 'lookupCurrency', arguments: '{"query":"GBP"}' },
          },
        ],
      },
      { role: 'tool', toolCallId: 'call_1', content: 'USD -> US Dollar' },
      { role: 'tool', toolCallId: 'call_2', content: 'EUR -> Euro' },
      { role: 'tool', toolCallId: 'call_3', content: 'GBP -> Pound Sterling' },
    ]

    const out = format(messages)
    const ids = functionResponseIds(out)

    expect(ids).toEqual(['call_1', 'call_2', 'call_3'])
  })
})

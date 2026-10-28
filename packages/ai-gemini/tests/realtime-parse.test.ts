import { describe, expect, it } from 'vitest'
import { parseResponseMessages } from '../src/realtime/client'
import type { LiveServerMessage } from '@google/genai'

describe('parseResponseMessages', () => {
  it('maps setup completion exclusively', () => {
    const responses = parseResponseMessages({
      setupComplete: {},
      // A real message never bundles these with setupComplete, but assert the
      // "exclusive" short-circuit ignores anything else present.
      serverContent: { turnComplete: true },
    } as LiveServerMessage)

    expect(responses).toEqual([
      { type: 'setup_complete', data: '', endOfTurn: false },
    ])
  })

  it('maps tool calls exclusively', () => {
    const toolCall = { functionCalls: [{ id: '1', name: 'getTime', args: {} }] }
    const responses = parseResponseMessages({
      toolCall,
    } as LiveServerMessage)

    expect(responses).toEqual([
      { type: 'tool_call', data: toolCall, endOfTurn: false },
    ])
  })

  it('emits audio and input/output transcription from one bundled message', () => {
    const responses = parseResponseMessages({
      serverContent: {
        modelTurn: { parts: [{ inlineData: { data: 'AAAA' } }] },
        inputTranscription: { text: 'hello', finished: true },
        outputTranscription: { text: 'hi', finished: false },
      },
    } as LiveServerMessage)

    expect(responses.map((r) => r.type)).toEqual([
      'audio',
      'input_transcription',
      'output_transcription',
    ])
    const input = responses.find((r) => r.type === 'input_transcription')
    expect(input).toMatchObject({ data: { text: 'hello', finished: true } })
  })

  it('distinguishes thought parts from text parts', () => {
    const responses = parseResponseMessages({
      serverContent: {
        modelTurn: {
          parts: [{ text: 'thinking...', thought: true }, { text: 'answer' }],
        },
      },
    } as LiveServerMessage)

    expect(responses).toEqual([
      { type: 'thought', data: 'thinking...', endOfTurn: false },
      { type: 'text', data: 'answer', endOfTurn: false },
    ])
  })

  it('maps go_away, usage and turn completion', () => {
    const goAway = parseResponseMessages({
      goAway: { timeLeft: '5s' },
    } as LiveServerMessage)
    expect(goAway[0]).toMatchObject({
      type: 'go_away',
      data: { timeLeft: '5s' },
    })

    const usage = parseResponseMessages({
      usageMetadata: { totalTokenCount: 10 },
    } as LiveServerMessage)
    expect(usage[0]?.type).toBe('usage_metadata')

    const turn = parseResponseMessages({
      serverContent: { turnComplete: true },
    } as LiveServerMessage)
    expect(turn).toEqual([{ type: 'turn_complete', data: '', endOfTurn: true }])
  })

  it('returns an empty array for an empty message', () => {
    expect(parseResponseMessages({} as LiveServerMessage)).toEqual([])
  })
})

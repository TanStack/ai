import { describe, expect, it } from 'vitest'
import { buildPrompt } from '../src/messages/prompt'
import type { ModelMessage } from '@tanstack/ai'

const user = (content: ModelMessage['content']): ModelMessage => ({
  role: 'user',
  content,
})
const assistant = (content: ModelMessage['content']): ModelMessage => ({
  role: 'assistant',
  content,
})

describe('buildPrompt', () => {
  it('resumes with only the last user message when sessionId is provided', () => {
    const result = buildPrompt(
      [
        user('first question'),
        assistant('first answer'),
        user('follow-up question'),
      ],
      'sess-1',
    )
    expect(result).toEqual({ prompt: 'follow-up question', resume: 'sess-1' })
  })

  it('throws when sessionId is provided but there is no trailing user message', () => {
    expect(() => buildPrompt([user('q'), assistant('a')], 'sess-1')).toThrow(
      /user message/i,
    )
  })

  it('sends a single user message as-is for a fresh session', () => {
    expect(buildPrompt([user('hello')], undefined)).toEqual({ prompt: 'hello' })
  })

  it('flattens prior turns into a transcript preamble for fresh multi-turn history', () => {
    const { prompt, resume } = buildPrompt(
      [user('What is 2+2?'), assistant('4'), user('And times 3?')],
      undefined,
    )
    expect(resume).toBeUndefined()
    expect(prompt).toBe(
      'Previous conversation:\nUser: What is 2+2?\nAssistant: 4\n\nAnd times 3?',
    )
  })

  it('skips tool messages and assistant tool-call-only turns when flattening', () => {
    const messages: Array<ModelMessage> = [
      user('list files'),
      {
        role: 'assistant',
        content: null,
        toolCalls: [
          {
            id: 't1',
            type: 'function',
            function: { name: 'ls', arguments: '{}' },
          },
        ],
      } as unknown as ModelMessage,
      { role: 'tool', content: 'file-a', toolCallId: 't1' },
      assistant('There is one file.'),
      user('thanks, which one?'),
    ]
    const { prompt } = buildPrompt(messages, undefined)
    expect(prompt).toBe(
      'Previous conversation:\nUser: list files\nAssistant: There is one file.\n\nthanks, which one?',
    )
  })

  it('extracts text from content-part arrays and ignores non-text parts', () => {
    const { prompt } = buildPrompt(
      [
        user([
          { type: 'text', content: 'describe ' },
          {
            type: 'image',
            source: { type: 'url', url: 'https://x/y.png' },
          } as never,
          { type: 'text', content: 'this' },
        ] as ModelMessage['content']),
      ],
      undefined,
    )
    expect(prompt).toBe('describe this')
  })

  it('throws when there is no usable user content at all', () => {
    expect(() => buildPrompt([], undefined)).toThrow(/user message/i)
  })
})

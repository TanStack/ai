import { describe, expect, it } from 'vitest'
import { mcpPromptToMessages } from '../src/prompts'

describe('mcpPromptToMessages', () => {
  it('converts a user text message correctly', () => {
    const prompt = {
      messages: [{ role: 'user', content: { type: 'text', text: 'review x' } }],
    }
    const messages = mcpPromptToMessages(prompt)

    expect(messages).toHaveLength(1)
    expect(messages[0]!.role).toBe('user')
    expect(messages[0]!.content).toBe('review x')
  })

  it('maps assistant role correctly', () => {
    const prompt = {
      messages: [
        { role: 'assistant', content: { type: 'text', text: 'looks good' } },
      ],
    }
    const messages = mcpPromptToMessages(prompt)

    expect(messages[0]!.role).toBe('assistant')
    expect(messages[0]!.content).toBe('looks good')
  })

  it('falls back to JSON.stringify for non-text content', () => {
    const content = { type: 'image', data: 'base64...' }
    const prompt = {
      messages: [{ role: 'user', content }],
    }
    const messages = mcpPromptToMessages(prompt)

    expect(messages[0]!.content).toBe(JSON.stringify(content))
  })

  it('treats unknown roles as user', () => {
    const prompt = {
      messages: [{ role: 'system', content: { type: 'text', text: 'hi' } }],
    }
    const messages = mcpPromptToMessages(prompt)

    expect(messages[0]!.role).toBe('user')
  })
})

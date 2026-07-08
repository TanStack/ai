import { describe, expect, it } from 'vitest'
import { createMCPClientFromTransport } from '../src/client'
import { mcpPromptToMessages } from '../src/prompts'
import { makeServerWithPrompt } from './helpers/in-memory-server'

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

describe('MCPClient prompts integration', () => {
  it('lists prompts and retrieves a prompt via the client', async () => {
    await using client = await createMCPClientFromTransport(
      (await makeServerWithPrompt()).clientTransport,
    )

    const list = await client.prompts()
    expect(list.length).toBeGreaterThan(0)

    const prompt = await client.getPrompt(list[0]!.name, { code: 'x = 1' })
    const messages = mcpPromptToMessages(prompt)

    expect(messages[0]).toHaveProperty('role')
    expect(messages[0]).toHaveProperty('content')
  })
})

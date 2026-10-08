import { describe, expect, it } from 'vitest'
import { createMCPClientFromTransport } from '../src/client'
import { mcpPromptToMessages } from '../src/prompts'
import { makeServerWithPrompt } from './helpers/in-memory-server'

describe('mcpPromptToMessages', () => {
  it('converts a user text message correctly', () => {
    const messages = mcpPromptToMessages({
      messages: [{ role: 'user', content: { type: 'text', text: 'review x' } }],
    })

    expect(messages).toEqual([{ role: 'user', content: 'review x' }])
  })

  it('maps assistant role correctly', () => {
    const messages = mcpPromptToMessages({
      messages: [
        { role: 'assistant', content: { type: 'text', text: 'looks good' } },
      ],
    })

    expect(messages).toEqual([{ role: 'assistant', content: 'looks good' }])
  })

  it('falls back to JSON.stringify for non-text content', () => {
    const content = { type: 'image', data: 'base64...' }
    const messages = mcpPromptToMessages({
      messages: [{ role: 'user', content }],
    })

    expect(messages).toEqual([
      { role: 'user', content: '{"type":"image","data":"base64..."}' },
    ])
  })

  it('gives the text null for a message without content', () => {
    const messages = mcpPromptToMessages({ messages: [{ role: 'user' }] })

    expect(messages).toEqual([{ role: 'user', content: 'null' }])
  })

  it('treats unknown roles as user', () => {
    const messages = mcpPromptToMessages({
      messages: [{ role: 'system', content: { type: 'text', text: 'hi' } }],
    })

    expect(messages).toEqual([{ role: 'user', content: 'hi' }])
  })
})

describe('MCPClient prompts integration', () => {
  it('lists prompts and retrieves a prompt via the client', async () => {
    await using client = await createMCPClientFromTransport(
      (await makeServerWithPrompt()).clientTransport,
    )

    const [listed] = await client.prompts()
    if (listed === undefined) throw new Error('The server listed no prompt')

    const prompt = await client.getPrompt(listed.name, { code: 'x = 1' })
    expect(mcpPromptToMessages(prompt)).toEqual([
      { role: 'user', content: 'Please review: x = 1' },
    ])
  })
})

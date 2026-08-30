import { describe, expect, it } from 'vitest'
import { Chat, useChatContext } from '../../src/ui'
import { createChatHook } from '../../src/create-chat-hook'

describe('public coexistence', () => {
  it('exports Chat UI and the options-only createChatHook', () => {
    expect(Chat).toBeDefined()
    expect(useChatContext).toBeDefined()
    expect(createChatHook).toBeDefined()
  })
})

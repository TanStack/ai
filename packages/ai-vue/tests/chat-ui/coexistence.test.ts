import { describe, expect, it } from 'vitest'
import {
  Chat,
  ChatInput,
  ChatMessage,
  ChatMessages,
  TextPart,
  ThinkingPart,
  createChatUI,
  createChatHook,
  createChatHookContexts,
} from '../../src/ui'

describe('public coexistence', () => {
  it('exports old and new APIs before 1.0', () => {
    expect(Chat).toBeDefined()
    expect(ChatInput).toBeDefined()
    expect(ChatMessage).toBeDefined()
    expect(ChatMessages).toBeDefined()
    expect(TextPart).toBeDefined()
    expect(ThinkingPart).toBeDefined()
    expect(createChatUI).toBeDefined()
    expect(createChatHook).toBeDefined()
    expect(createChatHookContexts).toBeDefined()
  })
})

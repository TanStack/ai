import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createChatUI } from '../../src/chat-ui/create-ui'

const src = dirname(fileURLToPath(import.meta.url))
const index = readFileSync(join(src, '../../src/ui.ts'), 'utf8')

describe('public coexistence', () => {
  it('exports old and new APIs before 1.0', () => {
    expect(createChatUI).toBeDefined()
    expect(index).toContain('export { Chat')
    expect(index).toContain('ChatInput')
    expect(index).toContain('ChatMessage')
    expect(index).toContain('ChatMessages')
    expect(index).toContain('TextPart')
    expect(index).toContain('ThinkingPart')
    expect(index).toContain('createChatUI')
    expect(index).toContain('createChatHook')
    expect(index).toContain('createChatHookContexts')
  })
})

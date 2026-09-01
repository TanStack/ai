import { expectTypeOf, it } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { createChatHook } from '../src/create-chat-hook'
import { useChat as useUnboundChat } from '../src/use-chat'

it('bound useChat infers tool names from factory options', () => {
  const check = () => {
    const getWeather = toolDefinition({
      name: 'getWeather',
      description: 'Look up weather',
    }).client(() => ({ ok: true }))
    const purchaseItem = toolDefinition({
      name: 'purchaseItem',
      description: 'Buy an item',
    }).client(() => ({ ok: true }))

    const chatOptions = {
      connection: { connect: async function* () {} },
      tools: [getWeather, purchaseItem],
    }

    const { useChat } = createChatHook(chatOptions)
    const fromHook = useChat()
    const fromUseChat = useUnboundChat(chatOptions)

    expectTypeOf(fromHook).toEqualTypeOf(fromUseChat)

    const message = fromHook.messages[0]
    if (message?.role === 'assistant') {
      for (const part of message.parts) {
        if (part.type === 'tool-call') {
          expectTypeOf(part.name).toEqualTypeOf<'getWeather' | 'purchaseItem'>()
        }
      }
    }
  }
  void check
})

import { expectTypeOf, it } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { createChatHook } from '../src/create-chat-hook'
import { createChat as createUnboundChat } from '../src/create-chat.svelte'

it('bound createChat infers tool names from factory options', () => {
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

    const { createChat } = createChatHook(chatOptions)
    const fromHook = createChat()
    const fromCreateChat = createUnboundChat(chatOptions)

    expectTypeOf(fromHook).toEqualTypeOf(fromCreateChat)
  }
  void check
})

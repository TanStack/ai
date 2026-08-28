import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import {
  createChatHook,
  createChatUI,
  UIChat,
  UIMessages,
  UIProvider,
} from '../../src/ui'
import { renderVueText } from './test-renderer'
import {
  chatOptions,
  createVueChatResult,
  messageWithToolResults,
  unknownToolMessage,
} from '../../../ai-client/tests/ui-fixtures'

const kit = {
  layout: defineComponent(
    (_, { slots }) =>
      () =>
        slots.messages?.(),
  ),
  message: defineComponent(
    (_, { slots }) =>
      () =>
        h('article', slots.parts?.()),
  ),
  parts: {
    fallback: defineComponent({
      props: ['part'],
      setup(props) {
        return () => h('span', props.part.type)
      },
    }),
  },
  tools: {
    getWeather: defineComponent({
      props: ['part'],
      setup(props) {
        return () => h('strong', props.part.input?.city)
      },
    }),
    purchaseItem: defineComponent(() => () => null),
  },
  interrupts: {
    generic: {
      choosePlan: defineComponent(() => () => null),
      fallback: defineComponent(() => () => null),
    },
  },
}

describe('Vue createChatHook', () => {
  it('returns useAppChat, ui, and context composables from options and chatComponents', () => {
    const { useAppChat, ui, useChatContext } = createChatHook({
      options: chatOptions,
      chatComponents: kit,
    })
    expect(typeof useAppChat).toBe('function')
    expect(ui).toBeDefined()
    expect(typeof useChatContext).toBe('function')
  })
})

describe('Vue createChatUI', () => {
  it('renders automatic and scoped-slot traversal', async () => {
    const ui = createChatUI(chatOptions, kit)
    const chat = createVueChatResult([messageWithToolResults])

    const automatic = await renderVueText(
      defineComponent(() => () => h(UIChat, { ui, chat })),
    )
    expect(automatic).toContain('Paris')

    const manual = await renderVueText(
      defineComponent(
        () => () =>
          h(
            UIProvider,
            { ui, chat },
            {
              default: () =>
                h(
                  UIMessages,
                  { ui },
                  {
                    default: ({ messages }: { messages: Array<unknown> }) =>
                      h('span', String(messages.length)),
                  },
                ),
            },
          ),
      ),
    )
    expect(manual).toContain('1')
  })

  it('warns once for a missing runtime key', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const ui = createChatUI(chatOptions, kit)
    const chat = createVueChatResult([unknownToolMessage])
    await renderVueText(
      defineComponent(() => () => h(UIChat, { ui, chat })),
    )
    await renderVueText(
      defineComponent(() => () => h(UIChat, { ui, chat })),
    )
    expect(
      warn.mock.calls.filter((call) =>
        String(call[0]).includes('[tanstack-ai-ui]'),
      ),
    ).toHaveLength(1)
    warn.mockRestore()
  })
})

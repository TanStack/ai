import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { createUI, UIChat, UIMessages, UIProvider } from '../src'
import { renderVueText } from './test-renderer'
import {
  chatOptions,
  createVueChatResult,
  messageWithToolResults,
  unknownToolMessage,
} from '../../ai-client/tests/ui-fixtures'

describe('Vue createUI', () => {
  it('renders automatic and scoped-slot traversal', async () => {
    const ui = createUI(chatOptions)
    const chat = createVueChatResult([messageWithToolResults])
    const components = ui.defineComponents({
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
    })

    const automatic = await renderVueText(
      defineComponent(() => () => h(UIChat, { ui, chat, components })),
    )
    expect(automatic).toContain('Paris')

    const manual = await renderVueText(
      defineComponent(
        () => () =>
          h(
            UIProvider,
            { ui, chat, components },
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
    const ui = createUI(chatOptions)
    const chat = createVueChatResult([unknownToolMessage])
    const components = ui.defineComponents({
      layout: defineComponent(
        (_, { slots }) =>
          () =>
            slots.messages?.(),
      ),
      message: defineComponent(
        (_, { slots }) =>
          () =>
            slots.parts?.(),
      ),
      parts: { fallback: defineComponent(() => () => null) },
      tools: {
        getWeather: defineComponent(() => () => null),
        purchaseItem: defineComponent(() => () => null),
      },
      interrupts: {
        generic: {
          choosePlan: defineComponent(() => () => null),
          fallback: defineComponent(() => () => null),
        },
      },
    })
    await renderVueText(
      defineComponent(() => () => h(UIChat, { ui, chat, components })),
    )
    await renderVueText(
      defineComponent(() => () => h(UIChat, { ui, chat, components })),
    )
    expect(
      warn.mock.calls.filter((call) =>
        String(call[0]).includes('[tanstack-ai-ui]'),
      ),
    ).toHaveLength(1)
    warn.mockRestore()
  })
})

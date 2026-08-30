import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { Chat } from '../../src/ui'
import { renderVueText } from './test-renderer'
import {
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

describe('Vue Chat', () => {
  it('renders mapped tools from chat.messages', async () => {
    const chat = createVueChatResult([messageWithToolResults])
    const automatic = await renderVueText(
      defineComponent(() => () => h(Chat, { chat, components: kit })),
    )
    expect(automatic).toContain('Paris')
  })

  it('warns once for a missing runtime key', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const chat = createVueChatResult([unknownToolMessage])
    await renderVueText(
      defineComponent(() => () => h(Chat, { chat, components: kit })),
    )
    await renderVueText(
      defineComponent(() => () => h(Chat, { chat, components: kit })),
    )
    expect(
      warn.mock.calls.some((call) =>
        String(call[0]).includes('Missing tools'),
      ),
    ).toBe(true)
    warn.mockRestore()
  })
})

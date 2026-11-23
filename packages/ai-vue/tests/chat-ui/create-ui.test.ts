import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { UIMessage } from '@tanstack/ai-client'
import {
  createChatHook,
  createChatUI,
  UIChat,
  UIMessages,
  UIProvider,
} from '../../src/ui'
import type { ChatUIFactoryConfig, UIDescriptor } from '../../src/ui'
import { renderVueText } from './test-renderer'
import {
  chatOptions,
  createVueChatResult,
  messageWithToolResults,
  unknownToolMessage,
} from '../../../ai-client/tests/ui-fixtures'

const kit = {
  components: {
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
  },
  partsComponents: {
    fallback: defineComponent({
      props: ['part'],
      setup(props) {
        return () => h('span', props.part.type)
      },
    }),
  },
  toolsComponents: {
    getWeather: defineComponent({
      props: ['part'],
      setup(props) {
        return () => h('strong', props.part.input?.city)
      },
    }),
    purchaseItem: defineComponent(() => () => null),
  },
  interruptsComponents: {
    generic: {
      choosePlan: defineComponent(() => () => null),
      fallback: defineComponent(() => () => null),
    },
  },
}

const activityKit: ChatUIFactoryConfig<typeof chatOptions> = {
  ...kit,
  partsComponents: {
    ...kit.partsComponents,
    activity: defineComponent({
      props: ['part'],
      setup(props) {
        return () => h('i', props.part.activityType)
      },
    }),
  },
  activitiesComponents: {
    'sandbox.status': (props) => h('b', props.part.content.status),
  },
}

function activityMessage(
  activityType: string,
  content: Record<string, unknown>,
): UIMessage {
  return {
    id: `activity-${activityType}`,
    role: 'activity',
    parts: [{ type: 'activity', activityType, content }],
  }
}

function renderChat(
  ui: UIDescriptor<typeof chatOptions>,
  chat: ReturnType<typeof createVueChatResult>,
) {
  return renderVueText(defineComponent(() => () => h(UIChat, { ui, chat })))
}

describe('Vue createChatHook', () => {
  it('returns useAppChat, ui, and context composables from options and chatComponents', () => {
    const { useAppChat, ui, useChatContext } = createChatHook({
      options: chatOptions,
      ...kit,
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

    const automatic = await renderChat(ui, chat)
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
    await renderChat(ui, chat)
    await renderChat(ui, chat)
    expect(
      warn.mock.calls.filter((call) =>
        String(call[0]).includes('[tanstack-ai-ui]'),
      ),
    ).toHaveLength(1)
    warn.mockRestore()
  })

  it('renders each queued item and binds cancelQueued', async () => {
    const cancelled: Array<string> = []
    const ui = createChatUI(chatOptions, {
      ...kit,
      components: {
        ...kit.components,
        layout: defineComponent(
          (_, { slots }) =>
            () =>
              slots.queue?.(),
        ),
        queue: defineComponent({
          props: ['item'],
          setup(props) {
            props.item.cancelQueued()
            return () =>
              h(
                'em',
                typeof props.item.content === 'string'
                  ? props.item.content
                  : '',
              )
          },
        }),
      },
    })
    const chat = createVueChatResult([], [], {
      queue: [{ id: 'q1', content: 'later', createdAt: 1 }],
      cancelQueued: (id) => {
        cancelled.push(id)
      },
    })
    const markup = await renderChat(ui, chat)
    expect(markup).toContain('<em>later</em>')
    expect(cancelled).toEqual(['q1'])
  })

  it('renders an activity part with the activitiesComponents entry of its type', async () => {
    const ui = createChatUI(chatOptions, activityKit)
    const chat = createVueChatResult([
      activityMessage('sandbox.status', {
        status: 'starting',
        provider: 'e2b',
      }),
    ])
    const markup = await renderChat(ui, chat)
    expect(markup).toContain('<b>starting</b>')
    expect(markup).not.toContain('<i>')
  })

  it('renders partsComponents.activity for a type with no entry', async () => {
    const ui = createChatUI(chatOptions, activityKit)
    const chat = createVueChatResult([
      activityMessage('deploy.progress', { step: 1 }),
    ])
    expect(await renderChat(ui, chat)).toContain('<i>deploy.progress</i>')
  })
})

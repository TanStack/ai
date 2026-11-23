import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { createElement } from 'remix/ui'
import { render } from 'remix/ui/test'
import { createChat } from '../src/create-chat.ts'
import { createChatHook } from '../src/chat-ui/create-chat-hook.ts'
import { createChatUI } from '../src/chat-ui/create-ui.tsx'
import type {
  ChatUIFactoryConfig,
  ChatUIHost,
  LayoutProps,
  MessageProps,
} from '../src/chat-ui/create-ui.tsx'
import type { ActivityProps } from '../src/ui.ts'
import type { ActivityTypeDefinition } from '@tanstack/ai/client'
import type { Handle } from 'remix/ui'
import type { UIMessage } from '../src/types.ts'

const weatherMessage: UIMessage = {
  id: 'message-1',
  role: 'assistant',
  parts: [
    {
      type: 'tool-call',
      id: 'call-weather',
      name: 'getWeather',
      arguments: '{"city":"London"}',
      input: { city: 'London' },
      state: 'complete',
    },
  ],
}

const sandboxStatusMessage: UIMessage = {
  id: 'sandbox-run-1',
  role: 'activity',
  parts: [
    {
      type: 'activity',
      activityType: 'sandbox.status',
      content: { status: 'ready', provider: 'e2b' },
    },
  ],
}

const deployProgressMessage: UIMessage = {
  id: 'deploy-1',
  role: 'activity',
  parts: [
    {
      type: 'activity',
      activityType: 'deploy.progress',
      content: { step: 1, total: 3 },
    },
  ],
}

const chatOptions = {
  tools: [{ name: 'getWeather' as const }],
}

type DeployProgressContent = { step: number; total: number }

// A declared activity type. The checks below read only its type.
type DeployProgress = ActivityTypeDefinition<
  'deploy.progress',
  DeployProgressContent,
  DeployProgressContent
>

type ActivityOptions = { activities: readonly [DeployProgress] }

// The content type of the 'deploy.progress' parts in a list of messages.
type DeployContentIn<TMessages extends ReadonlyArray<UIMessage<any, any>>> =
  TMessages[number]['parts'][number] extends infer TPart
    ? TPart extends { activityType: 'deploy.progress'; content: infer TContent }
      ? TContent
      : never
    : never

function getWeather(handle: Handle<{ part: { input?: { city?: string } } }>) {
  return () => createElement('strong', {}, handle.props.part.input?.city)
}

function SandboxCard(
  handle: Handle<ActivityProps<typeof chatOptions, 'sandbox.status'>>,
) {
  return () => createElement('b', {}, handle.props.part.content.status)
}

const kit: ChatUIFactoryConfig<typeof chatOptions> = {
  components: {
    layout(handle: Handle<LayoutProps<typeof chatOptions>>) {
      return () => {
        const { Messages } = handle.props
        return createElement(Messages)
      }
    },
    message(handle: Handle<MessageProps<typeof chatOptions>>) {
      return () => {
        const { Parts } = handle.props
        return createElement(Parts)
      }
    },
  },
  partsComponents: {
    fallback() {
      return () => null
    },
  },
  toolsComponents: {
    getWeather,
  },
}

// The fake host has only the fields that the UI reads, and it takes plain
// messages, so it needs a cast.
function host(messages: Array<UIMessage>): ChatUIHost<typeof chatOptions> {
  return {
    messages,
    interrupts: [],
    queue: [],
    cancelQueued() {},
  } as unknown as ChatUIHost<typeof chatOptions>
}

describe('createChatHook', () => {
  it('returns createAppChat, ui, and useChatContext', () => {
    const { createAppChat, ui, useChatContext } = createChatHook({
      options: chatOptions,
      ...kit,
    })
    expect(createAppChat).toBeTypeOf('function')
    expect(ui.Chat).toBeTypeOf('function')
    expect(useChatContext).toBeTypeOf('function')
  })
})

describe('createChatUI', () => {
  let cleanup: (() => void) | undefined

  afterEach(() => {
    cleanup?.()
    cleanup = undefined
  })

  function renderChat(
    config: ChatUIFactoryConfig<typeof chatOptions>,
    messages: Array<UIMessage>,
  ) {
    const UI = createChatUI(chatOptions, config)
    const result = render(createElement(UI.Chat, { chat: host(messages) }))
    cleanup = result.cleanup
    return result.container
  }

  it('renders a getWeather tool component with the city text', () => {
    const container = renderChat(kit, [weatherMessage])
    expect(container.textContent).toContain('London')
  })

  it('renders an activity with its activitiesComponents entry, else with partsComponents.activity', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const container = renderChat(
      {
        ...kit,
        partsComponents: {
          activity: (handle) => () =>
            createElement('i', {}, handle.props.part.activityType),
        },
        activitiesComponents: { 'sandbox.status': SandboxCard },
      },
      [sandboxStatusMessage, deployProgressMessage],
    )
    expect(container.querySelector('b')?.textContent).toBe('ready')
    expect(container.querySelector('i')?.textContent).toBe('deploy.progress')
    // A type with no entry is not an error.
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('activity types', () => {
  it('keys activitiesComponents by activity type and types each part', () => {
    // Never called. It checks the props at a createChatUI call.
    const createActivityUI = (options: ActivityOptions) =>
      createChatUI(options, {
        components: { layout: () => () => null, message: () => () => null },
        partsComponents: {},
        activitiesComponents: {
          'sandbox.status': (handle) => {
            expectTypeOf(handle.props.part.content.status).toEqualTypeOf<
              'starting' | 'ready' | 'failed'
            >()
            return () => null
          },
          'deploy.progress': (handle) => {
            expectTypeOf(
              handle.props.part.content,
            ).toEqualTypeOf<DeployProgressContent>()
            return () => null
          },
          // @ts-expect-error 'build.log' is not built in and not in `activities`
          'build.log': () => () => null,
        },
      })
    void createActivityUI
    expectTypeOf<
      ActivityProps<ActivityOptions, 'deploy.progress'>['part']['content']
    >().toEqualTypeOf<DeployProgressContent>()
  })

  it('types the activity parts of the messages from activities', () => {
    // Never called. It gives the type that createChat returns.
    const createTypedChat = (handle: Handle, deployProgress: DeployProgress) =>
      createChat(handle, {
        connection: { async *connect() {} },
        threadId: 'thread-1',
        activities: [deployProgress],
      })
    expectTypeOf<
      DeployContentIn<ReturnType<typeof createTypedChat>['messages']>
    >().toEqualTypeOf<DeployProgressContent>()
    expectTypeOf<
      DeployContentIn<ChatUIHost<ActivityOptions>['messages']>
    >().toEqualTypeOf<DeployProgressContent>()
  })
})

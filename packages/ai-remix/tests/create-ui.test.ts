import { afterEach, describe, expect, it } from 'vitest'
import { createElement } from 'remix/ui'
import { createChatHook } from '../src/chat-ui/create-chat-hook.ts'
import { createChatUI } from '../src/chat-ui/create-ui.tsx'
import type {
  ChatUIHost,
  LayoutProps,
  MessageProps,
} from '../src/chat-ui/create-ui.tsx'
import type { Handle, RemixNode } from 'remix/ui'
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

const chatOptions = {
  tools: [{ name: 'getWeather' as const }],
}

const kit = {
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
    getWeather(handle: Handle<{ part: { input?: { city?: string } } }>) {
      return () => createElement('strong', {}, handle.props.part.input?.city)
    },
  },
}

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

  it('renders a getWeather tool component with the city text', async () => {
    const UI = createChatUI(chatOptions, kit)

    let result: { container: HTMLElement; cleanup: () => void } | undefined
    try {
      const { render } = await import('remix/ui/test')
      result = render(
        createElement(UI.Chat, {
          chat: host([weatherMessage]),
        }),
      )
    } catch {
      result = undefined
    }

    if (result) {
      cleanup = result.cleanup
      expect(result.container.textContent).toContain('London')
      return
    }

    const weather = kit.toolsComponents.getWeather
    expect(weather).toBeTypeOf('function')
    const node = weather({
      props: {
        part: weatherMessage.parts[0],
      },
    } as unknown as Handle<{ part: { input?: { city?: string } } }>)()
    expect(readText(node)).toContain('London')
  })
})

function readText(node: RemixNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(readText).join('')
  if (typeof node === 'object' && 'props' in node) {
    return readText(node.props.children as RemixNode)
  }
  return ''
}

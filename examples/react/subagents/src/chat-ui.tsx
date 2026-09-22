import { fetchServerSentEvents } from '@tanstack/ai-react'
import {
  createChatHook,
  TextPart,
  type LayoutProps,
} from '@tanstack/ai-react/ui'
import { ChatInput } from '@/components/chat-input'
import { OpenRouterKeyForm } from '@/components/open-router-key-form'
import { Researcher, Writer } from '@/components/subagent-card'
import { byok } from '@/lib/byok'

export const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
  byok,
  subagents: {
    researcher: {
      description: 'Looks up facts, sources, and background for a blog post',
    },
    writer: {
      description: 'Drafts or rewrites a blog post',
    },
  },
}

export type BlogChatOptions = typeof chatOptions

export const { useAppChat, useChatContext } = createChatHook({
  options: chatOptions,
  components: {
    layout: function Layout({
      Messages,
      Input,
    }: LayoutProps<typeof chatOptions>) {
      return (
        <div className="flex h-screen flex-col bg-gray-900">
          <div className="border-b border-orange-500/20 bg-gray-800 px-4 py-3">
            <h1 className="mb-2 text-sm font-semibold text-white">Blog desk</h1>
            <OpenRouterKeyForm />
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <Messages />
          </div>
          <Input />
        </div>
      )
    },
    message: function Message({ message, Parts }) {
      return (
        <article
          data-role={message.role}
          className={`mb-2 rounded-lg p-4 text-gray-100 ${
            message.role === 'assistant'
              ? 'bg-linear-to-r from-orange-500/5 to-red-600/5'
              : 'bg-transparent'
          }`}
        >
          <Parts />
        </article>
      )
    },
    input: ChatInput,
  },
  partsComponents: {
    text: ({ part }) => (
      <TextPart className="chat-markdown" content={part.content} />
    ),
    fallback: () => null,
  },
  subagentsComponents: {
    researcher: Researcher,
    writer: Writer,
  },
})

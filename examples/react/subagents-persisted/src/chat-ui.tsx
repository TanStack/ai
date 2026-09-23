import { fetchServerSentEvents } from '@tanstack/ai-react'
import {
  createChatHook,
  TextPart,
  ThinkingPart,
  type LayoutProps,
} from '@tanstack/ai-react/ui'
import { ChatInput } from '@/components/chat-input'
import { OpenRouterKeyForm } from '@/components/open-router-key-form'
import { Researcher, Seo, Writer } from '@/components/subagent-card'
import { byok } from '@/lib/byok'
import { THREAD_ID } from '@/lib/thread'

export const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
  byok,
  threadId: THREAD_ID,
  persistence: true,
  subagents: {
    researcher: {
      description: 'Looks up facts, sources, and background for a blog post',
    },
    writer: {
      description: 'Drafts or rewrites a blog post',
    },
    seo: {
      description: 'Suggests SEO titles, a meta description, and tags',
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
            <h1 className="mb-2 text-sm font-semibold text-white">
              Saved blog desk
            </h1>
            <p className="mb-2 text-xs text-gray-400">
              Refresh keeps this chat. A refresh during a run continues the
              stream.
            </p>
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
    thinking: ({ part }) => (
      <ThinkingPart
        content={part.content}
        className="mb-2 rounded border border-gray-700 bg-gray-800/60 p-2 text-xs text-gray-400"
      />
    ),
    fallback: () => null,
  },
  subagentsComponents: {
    researcher: Researcher,
    writer: Writer,
    seo: Seo,
  },
})

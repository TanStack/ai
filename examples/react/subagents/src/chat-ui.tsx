import type { ReactNode } from 'react'
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { createChatHook, type LayoutProps } from '@tanstack/ai-react/ui'
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
      Subagents,
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
          <aside className="border-t border-orange-500/10 px-4 py-3">
            <Subagents />
          </aside>
          <Input />
        </div>
      )
    },
    message: function Message({ message, Parts }) {
      return (
        <article
          data-role={message.role}
          className={`mb-2 rounded-lg p-4 ${
            message.role === 'assistant'
              ? 'bg-linear-to-r from-orange-500/5 to-red-600/5'
              : 'bg-transparent'
          }`}
        >
          <Parts />
        </article>
      )
    },
    input: function Input(): ReactNode {
      const chat = useChatContext()
      return (
        <>
          {chat.error ? (
            <div className="mx-4 mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {chat.error.message}
            </div>
          ) : null}
          {chat.isLoading ? (
            <div className="mb-3 flex items-center justify-center">
              <button
                type="button"
                onClick={chat.stop}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Stop
              </button>
            </div>
          ) : null}
          <form
            className="border-t border-orange-500/10 bg-gray-900/80 px-4 py-3"
            onSubmit={(event) => {
              event.preventDefault()
              const field = event.currentTarget.elements.namedItem('message')
              if (!(field instanceof HTMLTextAreaElement)) return
              const text = field.value.trim()
              if (!text) return
              field.value = ''
              void chat.sendMessage(text)
            }}
          >
            <div className="flex items-end gap-2">
              <textarea
                name="message"
                rows={1}
                disabled={chat.isLoading}
                placeholder="Ask for research, or ask for a draft..."
                className="w-full resize-none rounded-lg border border-orange-500/20 bg-gray-800/50 px-4 py-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
              />
              <button
                type="submit"
                disabled={chat.isLoading}
                className="rounded-lg bg-orange-500 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </form>
        </>
      )
    },
  },
  partsComponents: {
    text: ({ part }) => (
      <div className="whitespace-pre-wrap text-white">{part.content}</div>
    ),
    fallback: () => null,
  },
  subagentsComponents: {
    researcher: Researcher,
    writer: Writer,
  },
})

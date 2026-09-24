import { useChatContext } from '@/chat-ui'

export function ChatInput() {
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
          void chat.sendMessage(text).catch(() => undefined)
        }}
      >
        <div className="flex items-end gap-2">
          <textarea
            name="message"
            rows={1}
            disabled={chat.isLoading}
            placeholder="Ask for research, a draft, or SEO titles..."
            onKeyDown={(event) => {
              // Enter also confirms an IME composition. Do not send then.
              if (
                event.key !== 'Enter' ||
                event.shiftKey ||
                event.nativeEvent.isComposing
              ) {
                return
              }
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }}
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
}

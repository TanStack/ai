import { createFileRoute } from '@tanstack/react-router'
import { useChat } from '@tanstack/ai-react'
import { Chat } from '@tanstack/ai-react/ui'
import { chatOptions } from '@/chat/options'
import { selectedModel } from '@/chat/model'
import { chatComponents } from '@/components/chat/ui-components'

export const Route = createFileRoute('/')({
  component: TripDesk,
})

function TripDesk() {
  const chat = useChat({
    ...chatOptions,
    forwardedProps: {
      model: selectedModel,
    },
  })

  return (
    <div className="mx-auto flex h-svh w-full max-w-3xl flex-col">
      <header className="flex items-center justify-between px-4 py-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-primary">
            TanStack AI
          </p>
          <h1 className="text-2xl">Trip desk</h1>
        </div>
        <img
          alt="TanStack"
          className="h-7"
          src="/brand/logos/tanstack-landscape-white.svg"
        />
      </header>
      <Chat chat={chat} components={chatComponents} />
    </div>
  )
}

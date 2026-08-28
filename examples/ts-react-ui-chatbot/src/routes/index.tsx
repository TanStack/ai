import { createFileRoute } from '@tanstack/react-router'
import { UI, useChat } from '@/chat/options'
import { selectedModel } from '@/chat/model'
import { components } from '@/components/chat/ui-components'

export const Route = createFileRoute('/')({
  component: TripDesk,
})

function TripDesk() {
  const chat = useChat({
    get forwardedProps() {
      return { model: selectedModel }
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
      <UI.Chat chat={chat} components={components} />
    </div>
  )
}

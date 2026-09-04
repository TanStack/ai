import { createFileRoute } from '@tanstack/react-router'
import WorldStudio from '@/components/WorldStudio'

function WorldPage() {
  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-white">
            Live world generation
          </h1>
          <p className="max-w-2xl text-gray-400">
            Paste a Reactor key in the browser. The relay calls{' '}
            <code className="font-mono text-gray-300">generateWorld()</code>{' '}
            with that key, then the page connects and can steer the scene with a
            new prompt.
          </p>
        </header>

        <WorldStudio />
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: WorldPage,
})

import { createFileRoute } from '@tanstack/react-router'
import EvaluatePanel from '@/components/EvaluatePanel'

function EvaluatePage() {
  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-white">
            Support ticket evaluator
          </h1>
          <p className="max-w-2xl text-gray-400">
            Paste a support ticket. Jev answers three typed questions: which
            queue, how urgent, and whether the customer asks for a refund. The
            same <code className="font-mono text-gray-300">decide()</code> call
            runs for every provider. Only the adapter changes.
          </p>
        </header>

        <EvaluatePanel />
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: EvaluatePage,
})

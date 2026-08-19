import { createFileRoute } from '@tanstack/react-router'
import RerankPanel from '@/components/RerankPanel'

function RerankPage() {
  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-white">
            Document Reranking
          </h1>
          <p className="max-w-2xl text-gray-400">
            A fixed set of support articles, listed newest-first. The rerank
            model reorders them by how well each one answers the query — the
            same <code className="font-mono text-gray-300">rerank()</code> call,
            with a Cohere or an OpenRouter adapter.
          </p>
        </header>

        <RerankPanel />
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: RerankPage,
})

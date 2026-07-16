import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { usePlugin } from '@tanstack/ai-react/plugin'
import { ChatUI } from '@/components/ChatUI'
import { e2ePlugin } from '@/lib/e2e-plugin'
import type { ImageGenerationResult } from '@tanstack/ai'
import type { Provider } from '@/lib/types'

export interface PluginRouteSearch {
  provider: Provider
  testId?: string
  aimockPort?: number
}

const DEFAULT_PROVIDER: Provider = 'openai'

function parsePluginRouteSearch(
  search: Record<string, unknown>,
): PluginRouteSearch {
  const aimockPort =
    typeof search.aimockPort === 'string'
      ? Number.parseInt(search.aimockPort, 10)
      : undefined
  const provider =
    typeof search.provider === 'string'
      ? (search.provider as Provider)
      : DEFAULT_PROVIDER

  return {
    provider,
    ...(typeof search.testId === 'string' ? { testId: search.testId } : {}),
    ...(aimockPort !== undefined && !Number.isNaN(aimockPort)
      ? { aimockPort }
      : {}),
  }
}

export const Route = createFileRoute('/plugin')({
  component: PluginRoute,
  validateSearch: parsePluginRouteSearch,
})

// The image result carries either a URL or base64 data, provider-dependent.
function imageUrlOf(result: ImageGenerationResult | null): string | null {
  const image = result?.images[0]
  if (!image) return null
  return (
    image.url ??
    (image.b64Json ? `data:image/png;base64,${image.b64Json}` : null)
  )
}

function PluginRoute() {
  const { provider, testId, aimockPort } = Route.useSearch()

  // Routing metadata (provider/testId/aimockPort) rides along in every
  // plugin's forwardedProps; the server route peeks it (via req.forwardedProps)
  // to build adapters, and the one-shot plugins' schemas simply strip the
  // extra fields off `req.input`.
  const routing = { provider, testId, aimockPort }

  const plugin = usePlugin(e2ePlugin, {
    connection: fetchServerSentEvents('/api/plugin'),
    primaryChat: { forwardedProps: routing },
    banner: { forwardedProps: routing },
    bannerImage: { forwardedProps: routing },
  })

  const imageUrl = imageUrlOf(plugin.bannerImage.result)

  return (
    <div className="flex h-screen flex-col">
      <div className="space-y-2 border-b border-gray-700 p-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            data-testid="plugin-run-banner"
            className="rounded bg-orange-500 px-3 py-2 text-sm font-medium text-white"
            onClick={() => {
              void plugin.banner.run({ prompt: 'solo banner' })
            }}
          >
            Run Banner
          </button>
          <span
            data-testid="plugin-banner-status"
            className="text-xs text-gray-400"
          >
            {plugin.banner.status}
          </span>
          <span
            data-testid="plugin-banner-result"
            className="break-all text-xs text-gray-400"
          >
            {plugin.banner.result?.text ?? ''}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            data-testid="plugin-run-banner-image"
            className="rounded bg-purple-500 px-3 py-2 text-sm font-medium text-white"
            onClick={() => {
              void plugin.bannerImage.run({ prompt: 'solo banner image' })
            }}
          >
            Run Banner Image
          </button>
          <span
            data-testid="plugin-banner-image-status"
            className="text-xs text-gray-400"
          >
            {plugin.bannerImage.status}
          </span>
          {imageUrl && (
            <img
              data-testid="plugin-banner-image-result"
              src={imageUrl}
              alt="Generated banner"
              className="h-8 w-8 object-cover"
            />
          )}
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <ChatUI
          messages={plugin.primaryChat.messages}
          isLoading={plugin.primaryChat.isLoading}
          onSendMessage={(text) => {
            void plugin.primaryChat.sendMessage(text)
          }}
          onStop={plugin.primaryChat.stop}
        />
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useGenerateImage } from '@tanstack/ai-react'

/**
 * Server-driven generation-persistence harness (server half).
 *
 * `persistence: true` + a stable `threadId` — the hook keeps NO local store.
 * On mount it hydrates from the endpoint's GET (a `?threadId=` probe answered by
 * `/api/generation-persistence-server`) and restores transparently into the
 * normal fields, so a full `page.reload()` brings back `status: 'success'` and a
 * `result` whose image renders from the durable serve URL — FROM THE SERVER,
 * with `localStorage` empty. There is no `resumeSnapshot` field.
 */

const THREAD_ID = 'generation-server-thread'
const connection = fetchServerSentEvents('/api/generation-persistence-server')

export const Route = createFileRoute('/generation-persistence-server')({
  component: GenerationPersistenceServerPage,
})

function GenerationPersistenceServerPage() {
  const image = useGenerateImage({
    threadId: THREAD_ID,
    connection,
    persistence: true,
  })

  // The page is SSR'd; the spec must not click the server-rendered button
  // before React attaches handlers. This flag flips only after hydration.
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])

  return (
    <div style={{ padding: 16 }}>
      <h1>Generation persistence (server-driven)</h1>
      {hydrated ? <div data-testid="hydration-marker" /> : null}
      <button
        data-testid="generate-button"
        disabled={image.isLoading}
        onClick={() => void image.generate({ prompt: 'a lighthouse at dusk' })}
      >
        Generate
      </button>

      <div data-testid="status">{image.status}</div>
      <div data-testid="result-id">{image.result?.id ?? 'none'}</div>
      <div data-testid="error">{image.error?.message ?? 'none'}</div>

      {image.result?.images.map((img, i) => (
        <img
          key={i}
          data-testid="generated-image"
          alt="generated"
          src={
            img.url ??
            (img.b64Json ? `data:image/png;base64,${img.b64Json}` : '')
          }
        />
      ))}
    </div>
  )
}

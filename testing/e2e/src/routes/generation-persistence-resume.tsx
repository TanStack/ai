import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useGenerateImage } from '@tanstack/ai-react'

/**
 * Durable mid-run reload harness (client half).
 *
 * `persistence: true` + a stable `threadId` over a `connection`. The run pauses
 * mid-flight (see `/api/generation-persistence-resume`); the spec reloads during
 * that pause. On mount the hook hydrates from the GET, sees an `activeRun`, and
 * tails it through `joinRun` to completion — so `status` reaches `success` and
 * the image renders even though no client was connected when the run finished.
 */

const THREAD_ID = 'generation-resume-thread'
const connection = fetchServerSentEvents('/api/generation-persistence-resume')

export const Route = createFileRoute('/generation-persistence-resume')({
  component: GenerationPersistenceResumePage,
})

function GenerationPersistenceResumePage() {
  const image = useGenerateImage({
    threadId: THREAD_ID,
    connection,
    persistence: true,
  })

  // SSR'd page: don't let the spec click before React attaches handlers.
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])

  return (
    <div style={{ padding: 16 }}>
      <h1>Generation persistence (durable mid-run reload)</h1>
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

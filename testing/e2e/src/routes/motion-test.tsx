import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useGeneration } from '@tanstack/ai-react'
import type { MotionGenerationResult, MotionJobState } from '@tanstack/ai'

/**
 * Harness page for `generateMotion({ stream: true })`. `useGeneration`
 * streams `/api/motion` (fake fal queue, `complete` scenario), shows each
 * `motion:status` it sees, and lists the finished motion assets.
 */
export const Route = createFileRoute('/motion-test')({
  component: MotionTestPage,
})

function motionStateOf(value: unknown): MotionJobState | null {
  if (typeof value !== 'object' || value === null || !('status' in value)) {
    return null
  }
  switch (value.status) {
    case 'pending':
    case 'processing':
    case 'completed':
    case 'failed':
      return value.status
    default:
      return null
  }
}

function MotionTestPage() {
  // The button stays disabled until React hydrates, so a click always lands.
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  const [statuses, setStatuses] = useState<Array<MotionJobState>>([])
  const motion = useGeneration<{ prompt: string }, MotionGenerationResult>({
    threadId: 'motion-test',
    connection: fetchServerSentEvents('/api/motion'),
    body: { mode: 'stream', scenario: 'complete' },
    onChunk: (chunk) => {
      if (chunk.type !== 'CUSTOM' || chunk.name !== 'motion:status') return
      const state = motionStateOf(chunk.value)
      if (state) setStatuses((previous) => [...previous, state])
    },
  })

  return (
    <div data-testid="motion-test-page" style={{ padding: 16 }}>
      <button
        type="button"
        data-testid="generate-motion"
        disabled={!hydrated || motion.isLoading}
        onClick={() => {
          setStatuses([])
          void motion.generate({ prompt: 'A heavy overhead axe swing' })
        }}
      >
        Generate motion
      </button>
      <p data-testid="motion-generation-status">{motion.status}</p>
      <p data-testid="motion-statuses">{statuses.join(' > ')}</p>
      <ul data-testid="motion-assets">
        {motion.result?.assets.map((asset) => (
          <li key={asset.url}>
            {asset.format} {asset.url}
          </li>
        ))}
      </ul>
      {motion.error ? (
        <p data-testid="motion-error">{motion.error.message}</p>
      ) : null}
    </div>
  )
}

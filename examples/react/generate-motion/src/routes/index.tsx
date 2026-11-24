import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useGeneration } from '@tanstack/ai-react'
import { falByok } from '@tanstack/ai-fal/byok'
import type {
  Motion3dGenerationResult,
  Motion3dStatusResult,
} from '@tanstack/ai'
import { FalKeyForm } from '@/components/fal-key-form'
import { byok } from '@/lib/byok'

const CLIP_SECONDS = 4

const ATTACKER_PROMPT =
  'A heavy orc warrior leaps forward, raises a two-handed axe overhead, slams it down into the ground, and lands with a heavy stagger'
const REACTION_PROMPT =
  'A person is hit hard from the front, staggers backward, falls onto their back, then slowly gets up'

// A designer sets this after previewing the attacker clip. fal does not
// return contact timing, so the game owns this number, not the provider.
const IMPACT_TIME_SECONDS = 1.6

type Motion3dInput = { prompt: string; duration: number }

function hasJobId(value: unknown): value is { jobId: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'jobId' in value &&
    typeof value.jobId === 'string'
  )
}

function isMotionStatus(value: unknown): value is Motion3dStatusResult {
  return (
    hasJobId(value) && 'status' in value && typeof value.status === 'string'
  )
}

// One generation slot. The hook streams the job from /api/generate/motion.
// onChunk reads the fal job id and the queue status from CUSTOM events.
function useMotionClip(threadId: string) {
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<Motion3dStatusResult | null>(null)
  const [stopped, setStopped] = useState(false)
  const generation = useGeneration<Motion3dInput, Motion3dGenerationResult>({
    connection: fetchServerSentEvents('/api/generate/motion'),
    threadId,
    byok,
    onChunk: (chunk) => {
      if (chunk.type !== 'CUSTOM') return
      if (chunk.name === 'motion3d:job:created' && hasJobId(chunk.value)) {
        setJobId(chunk.value.jobId)
      }
      if (chunk.name === 'motion3d:status' && isMotionStatus(chunk.value)) {
        setJobStatus(chunk.value)
      }
    },
  })

  return {
    ...generation,
    jobId,
    jobStatus,
    stopped,
    generate: (input: Motion3dInput) => {
      generation.reset()
      setJobId(null)
      setJobStatus(null)
      setStopped(false)
      return generation.generate(input)
    },
    // stop() closes the stream in this tab. The fal job keeps running.
    stop: () => {
      generation.stop()
      setStopped(true)
    },
  }
}

type MotionClip = ReturnType<typeof useMotionClip>

function describeJob(status: Motion3dStatusResult) {
  switch (status.status) {
    case 'pending':
      return status.queuePosition === undefined
        ? 'Queued on fal'
        : `Queued on fal, position ${status.queuePosition}`
    case 'processing':
      return 'Generating'
    case 'completed':
      return 'Finished on fal, fetching files'
    case 'failed':
      return `Failed: ${status.error ?? 'fal gave no reason'}`
  }
}

function describeClip(clip: MotionClip) {
  if (clip.error) return `Error: ${clip.error.message}`
  if (clip.result) return 'Done'
  if (clip.stopped) return 'Stopped watching. The fal job keeps running.'
  if (clip.jobStatus) return describeJob(clip.jobStatus)
  if (clip.isLoading) return 'Submitting'
  return 'Not started'
}

function fbxUrl(motion: Motion3dGenerationResult) {
  return motion.assets.find((asset) => asset.format === 'fbx')?.url ?? null
}

// The JSON a game imports. Clips come from fal. Timing and effects are yours.
function buildManifest(
  attacker: Motion3dGenerationResult,
  reaction: Motion3dGenerationResult,
) {
  return {
    ability: 'orc-leap-slam',
    attacker: {
      clip: fbxUrl(attacker),
      source: attacker.model,
      jobId: attacker.jobId,
      seed: attacker.seed ?? null,
    },
    reactions: [{ clip: fbxUrl(reaction), trigger: 'impact' }],
    events: [
      {
        name: 'impact',
        timeSeconds: IMPACT_TIME_SECONDS,
        source: 'authored',
        note: 'Set by a designer after previewing the clip. The provider does not return contact timing.',
      },
    ],
    effects: ['shockwave', 'dust', 'ground-cracks', 'flying-rocks'],
  }
}

async function cancelOnFal(jobId: string) {
  const response = await fetch('/api/motion/cancel', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...byok.headers(falByok.id),
    },
    body: JSON.stringify({ jobId }),
  })
  if (!response.ok) throw new Error(await response.text())
}

function ClipPanel({
  id,
  title,
  clip,
  prompt,
  onPromptChange,
}: {
  id: string
  title: string
  clip: MotionClip
  prompt: string
  onPromptChange: (prompt: string) => void
}) {
  const [cancelNote, setCancelNote] = useState('')
  const { jobId } = clip

  const handleCancel = () => {
    if (!jobId) return
    setCancelNote('Asking fal to cancel...')
    void cancelOnFal(jobId)
      .then(() =>
        setCancelNote(
          'fal accepted the cancel. A running job can still finish.',
        ),
      )
      .catch((caught: unknown) =>
        setCancelNote(
          caught instanceof Error ? caught.message : 'Cancel failed',
        ),
      )
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-orange-500/20 bg-gray-800 p-4">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <label htmlFor={id} className="text-sm text-gray-300">
        Prompt ({CLIP_SECONDS} second clip)
      </label>
      <textarea
        id={id}
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
        rows={4}
        disabled={clip.isLoading}
        className="w-full resize-none rounded-lg border border-orange-500/20 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            void clip.generate({
              prompt: prompt.trim(),
              duration: CLIP_SECONDS,
            })
          }
          disabled={!prompt.trim() || clip.isLoading}
          className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Generate
        </button>
        <button
          type="button"
          onClick={clip.stop}
          disabled={!clip.isLoading}
          className="rounded-lg border border-gray-600 px-3 py-2 text-sm text-gray-200 disabled:opacity-50"
        >
          Stop watching
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={!jobId || Boolean(clip.result)}
          className="rounded-lg border border-red-500/40 px-3 py-2 text-sm text-red-300 disabled:opacity-50"
        >
          Cancel on fal
        </button>
      </div>
      <p className="text-sm text-gray-300" aria-live="polite">
        Status: {describeClip(clip)}
      </p>
      {jobId ? <p className="text-xs text-gray-500">fal job: {jobId}</p> : null}
      {cancelNote ? (
        <p className="text-xs text-amber-400">{cancelNote}</p>
      ) : null}
      {clip.result ? (
        <div className="flex flex-col gap-2">
          <ul className="flex flex-col gap-1 text-sm">
            {clip.result.assets.map((asset) => (
              <li key={asset.url}>
                <a
                  href={asset.url}
                  download={asset.fileName}
                  target="_blank"
                  rel="noreferrer"
                  className="text-orange-400 underline"
                >
                  Download {asset.fileName ?? asset.format}
                </a>{' '}
                <span className="text-gray-400">
                  ({asset.format.toUpperCase()}
                  {asset.fileSize === undefined
                    ? ''
                    : `, ${Math.round(asset.fileSize / 1024)} KB`}
                  )
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-400">
            fal file links expire. Download the file and store it with your game
            assets.
          </p>
        </div>
      ) : null}
    </section>
  )
}

function LeapSlamPage() {
  const [attackerPrompt, setAttackerPrompt] = useState(ATTACKER_PROMPT)
  const [reactionPrompt, setReactionPrompt] = useState(REACTION_PROMPT)
  const attacker = useMotionClip('orc-leap-slam')
  const reaction = useMotionClip('enemy-knockdown')
  const manifest =
    attacker.result && reaction.result
      ? buildManifest(attacker.result, reaction.result)
      : null

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="border-b border-orange-500/20 bg-gray-800 px-4 py-3">
        <FalKeyForm />
      </div>

      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
        <div>
          <h1 className="mb-2 text-2xl font-semibold text-white">
            Orc chieftain: Leap Slam
          </h1>
          <p className="text-sm text-gray-400">
            Generate the attacker clip and the enemy reaction clip. Each one is
            an FBX file from fal Hunyuan Motion.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <ClipPanel
            id="attacker-prompt"
            title="Attacker: orc leap slam"
            clip={attacker}
            prompt={attackerPrompt}
            onPromptChange={setAttackerPrompt}
          />
          <ClipPanel
            id="reaction-prompt"
            title="Reaction: enemy knockdown"
            clip={reaction}
            prompt={reactionPrompt}
            onPromptChange={setReactionPrompt}
          />
        </div>

        <section className="flex flex-col gap-3 rounded-lg border border-orange-500/20 bg-gray-800 p-4">
          <h2 className="text-lg font-semibold text-white">Ability manifest</h2>
          {manifest ? (
            <pre className="overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-200">
              {JSON.stringify(manifest, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-gray-400">
              Generate both clips to see the manifest.
            </p>
          )}
          <p className="text-sm text-gray-400">
            Your engine (for example Unity) does the rest. It retargets the
            clips to your rig, attaches the axe, and blends the clips. When the
            impact event fires, it applies damage, plays the reaction, and
            spawns the effects.
          </p>
        </section>
      </main>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: LeapSlamPage,
})

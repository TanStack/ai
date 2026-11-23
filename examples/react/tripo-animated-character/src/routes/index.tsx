import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useGenerate3DModel } from '@tanstack/ai-react'

// All three steps POST to /api/character. The `body` tells the server which
// step to run.
const connection = fetchServerSentEvents('/api/character')

function CharacterPage() {
  const [text, setText] = useState('A cartoon knight in a T-pose')
  const [progress, setProgress] = useState(0)

  // <model-viewer> uses window and customElements, so load it in the browser
  // only.
  useEffect(() => {
    void import('@google/model-viewer')
  }, [])

  // Step 3: the walk animation. Its result is the file the page shows.
  const animate = useGenerate3DModel({
    connection,
    body: { step: 'animate' },
    threadId: 'character-animate',
    onProgress: setProgress,
  })
  // Step 2: the skeleton. When it is done, start step 3 with its task id.
  const rig = useGenerate3DModel({
    connection,
    body: { step: 'rig' },
    threadId: 'character-rig',
    onProgress: setProgress,
    onResult: (result) => {
      setProgress(0)
      void animate.generate({ prompt: result.jobId })
    },
  })
  // Step 1: the model. When it is done, start step 2 with its task id.
  const model = useGenerate3DModel({
    connection,
    body: { step: 'model' },
    threadId: 'character-model',
    onProgress: setProgress,
    onResult: (result) => {
      setProgress(0)
      void rig.generate({ prompt: result.jobId })
    },
  })

  const steps = [
    { label: 'Step 1 of 3: making the model', run: model },
    { label: 'Step 2 of 3: adding a skeleton', run: rig },
    { label: 'Step 3 of 3: adding the walk animation', run: animate },
  ]
  const current = steps.find((step) => step.run.isLoading)
  const error = steps.find((step) => step.run.error)?.run.error
  const character = animate.result
  const status = current
    ? `${current.label} (${Math.round(progress)}%). This takes a few minutes.`
    : character
      ? 'Done. Your character walks.'
      : ''

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-8 text-white">
      <h1 className="text-2xl font-semibold">Tripo Animated Character</h1>
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault()
          const prompt = text.trim()
          if (!prompt) return
          // Clear the result and errors of the last run.
          rig.reset()
          animate.reset()
          setProgress(0)
          void model.generate({ prompt })
        }}
      >
        <label htmlFor="character" className="block text-sm text-gray-300">
          Describe a character with two arms and two legs
        </label>
        <div className="flex gap-2">
          <input
            id="character"
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={Boolean(current)}
            className="min-w-0 flex-1 rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={Boolean(current) || !text.trim()}
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Make character
          </button>
        </div>
      </form>

      <p role="status" className="text-sm text-gray-300">
        {status}
      </p>
      {error ? <p className="text-sm text-red-400">{error.message}</p> : null}

      {character ? (
        <>
          {/* Tripo files have no CORS header, so /api/file loads them. */}
          <model-viewer
            src={`/api/file?url=${encodeURIComponent(character.url)}`}
            alt="Your character, walking"
            autoplay
            camera-controls
            className="block h-96 w-full rounded-lg bg-gray-800"
          />
          <p className="text-sm text-gray-300">
            The Tripo file link expires. To keep the character, download the
            file soon. Make a new character to get a new link.
          </p>
        </>
      ) : null}
    </main>
  )
}

export const Route = createFileRoute('/')({
  component: CharacterPage,
})

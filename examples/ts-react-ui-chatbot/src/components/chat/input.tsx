import { useEffect, useRef, useState } from 'react'
import {
  fetchServerSentEvents,
  useAudioRecorder,
  useTranscription,
} from '@tanstack/ai-react'
import type { ContentPart } from '@tanstack/ai/client'
import {
  Loader2Icon,
  MicIcon,
  PaperclipIcon,
  SquareIcon,
  XIcon,
} from 'lucide-react'
import { byok } from '@/chat/byok'
import { useChatContext } from './ui-components'
import {
  PromptInput,
  PromptInputButton,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from '@/components/ai/prompt-input'
import { ModelSelector, type ChatModelId } from '@/components/ai/model-selector'
import { OpenaiKey } from '@/components/chat/openai-key'
import { setSelectedModel, selectedModel } from '@/chat/model'

type Draft = {
  id: string
  part: ContentPart
  label: string
  preview?: string
}

async function fileToDraft(file: File): Promise<Draft> {
  const value = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('Could not read the file'))
        return
      }
      const comma = result.indexOf(',')
      resolve(comma === -1 ? result : result.slice(comma + 1))
    }
    reader.onerror = () =>
      reject(reader.error ?? new Error('Could not read the file'))
    reader.readAsDataURL(file)
  })
  const mimeType = file.type || 'application/octet-stream'
  const source = { type: 'data' as const, value, mimeType }
  const part: ContentPart = mimeType.startsWith('image/')
    ? { type: 'image', source }
    : mimeType.startsWith('audio/')
      ? { type: 'audio', source }
      : mimeType.startsWith('video/')
        ? { type: 'video', source }
        : { type: 'document', source }
  return {
    id: crypto.randomUUID(),
    part,
    label: file.name,
    preview: mimeType.startsWith('image/')
      ? URL.createObjectURL(file)
      : undefined,
  }
}

export function ChatPromptInput() {
  const chat = useChatContext()
  const [model, setModel] = useState<ChatModelId>(selectedModel)
  const [text, setText] = useState('')
  const [drafts, setDrafts] = useState<Array<Draft>>([])
  const [inputError, setInputError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const draftsRef = useRef(drafts)
  draftsRef.current = drafts

  useEffect(() => {
    setMounted(true)
    return () => {
      for (const draft of draftsRef.current) {
        if (draft.preview) URL.revokeObjectURL(draft.preview)
      }
    }
  }, [])

  const { generate: transcribe, isLoading: isTranscribing } = useTranscription({
    connection: fetchServerSentEvents('/api/transcribe'),
    byok,
    byokProvider: () => 'openai',
    onResult: (result) => {
      setText((prev) => (prev ? `${prev} ${result.text}` : result.text))
    },
    onError: (error) => {
      setInputError(
        error instanceof Error ? error.message : 'Could not transcribe audio',
      )
    },
  })

  const {
    isRecording,
    isSupported: micSupported,
    start: startRecording,
    stop: stopRecording,
  } = useAudioRecorder()

  const status = chat.error ? 'error' : 'ready'

  function removeDraft(id: string) {
    setDrafts((prev) => {
      const next = prev.filter((draft) => draft.id !== id)
      const removed = prev.find((draft) => draft.id === id)
      if (removed?.preview) URL.revokeObjectURL(removed.preview)
      return next
    })
  }

  function send() {
    const trimmed = text.trim()
    if (!trimmed && drafts.length === 0) return
    if (drafts.length === 0) {
      void chat.sendMessage(trimmed)
    } else {
      const content: Array<ContentPart> = []
      if (trimmed) content.push({ type: 'text', content: trimmed })
      for (const draft of drafts) content.push(draft.part)
      void chat.sendMessage({ content })
      for (const draft of drafts) {
        if (draft.preview) URL.revokeObjectURL(draft.preview)
      }
      setDrafts([])
    }
    setText('')
  }

  async function toggleMic() {
    try {
      if (isRecording) {
        const rec = await stopRecording()
        const mimeType = rec.mimeType.split(';')[0] ?? rec.mimeType
        await transcribe({ audio: `data:${mimeType};base64,${rec.base64}` })
        return
      }
      setInputError(null)
      await startRecording()
    } catch (error) {
      setInputError(
        error instanceof Error ? error.message : 'Could not record audio',
      )
    }
  }

  return (
    <PromptInput
      onSubmit={(event) => {
        event.preventDefault()
        send()
      }}
    >
      <input
        accept="image/*,application/pdf,audio/*,video/*"
        className="hidden"
        multiple
        onChange={(event) => {
          const files = event.currentTarget.files
          if (!files) return
          void Promise.all(Array.from(files).map(fileToDraft))
            .then((next) => {
              setInputError(null)
              setDrafts((prev) => [...prev, ...next])
            })
            .catch((error: unknown) => {
              setInputError(
                error instanceof Error
                  ? error.message
                  : 'Could not attach the file',
              )
            })
          event.currentTarget.value = ''
        }}
        ref={fileRef}
        type="file"
      />
      {drafts.length > 0 ? (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {drafts.map((draft) => (
            <div className="relative" key={draft.id}>
              {draft.part.type === 'audio' && draft.preview ? (
                <audio className="h-10 max-w-56" controls src={draft.preview} />
              ) : draft.preview ? (
                <img
                  alt=""
                  className="size-14 rounded-md object-cover"
                  src={draft.preview}
                />
              ) : (
                <span className="block max-w-40 truncate rounded-md border px-2 py-1 text-xs">
                  {draft.label}
                </span>
              )}
              <button
                className="absolute -top-1 -right-1 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                onClick={() => removeDraft(draft.id)}
                type="button"
              >
                <XIcon className="size-3" />
                <span className="sr-only">Remove {draft.label}</span>
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {inputError ? (
        <p className="px-4 pt-2 text-destructive text-xs">{inputError}</p>
      ) : null}
      <PromptInputTextarea
        name="message"
        onChange={(event) => setText(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return
          if (event.key !== 'Enter' || event.shiftKey) return
          event.preventDefault()
          send()
        }}
        placeholder="Plan a trip, attach a photo or PDF, or speak a plan…"
        value={text}
      />
      <PromptInputToolbar>
        <PromptInputTools>
          <PromptInputButton
            aria-label="Attach a photo, PDF, or clip"
            disabled={chat.isLoading}
            onClick={() => fileRef.current?.click()}
          >
            <PaperclipIcon className="size-4" />
          </PromptInputButton>
          {mounted && micSupported ? (
            <PromptInputButton
              aria-label={
                isRecording ? 'Stop recording' : 'Record a voice note'
              }
              aria-pressed={isRecording}
              disabled={chat.isLoading || isTranscribing}
              onClick={() => void toggleMic()}
            >
              {isTranscribing ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : isRecording ? (
                <SquareIcon className="size-4 text-destructive" />
              ) : (
                <MicIcon className="size-4" />
              )}
            </PromptInputButton>
          ) : null}
          <OpenaiKey />
          <ModelSelector
            onChange={(next) => {
              setSelectedModel(next)
              setModel(next)
            }}
            value={model}
          />
        </PromptInputTools>
        <PromptInputSubmit
          disabled={!text.trim() && drafts.length === 0}
          status={status}
        />
      </PromptInputToolbar>
    </PromptInput>
  )
}

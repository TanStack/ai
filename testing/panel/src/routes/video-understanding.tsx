import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { useMemo, useRef, useState } from 'react'
import { Loader2, Send, Upload, Video } from 'lucide-react'

export const Route = createFileRoute('/video-understanding')({
  component: VideoUnderstanding,
})

type Mode = 'agentic' | 'single-pass'

interface UploadedVideo {
  uri: string
  mimeType: string
  name: string
}

function getMessageText(parts: Array<any>): string {
  return parts
    .filter((part) => part.type === 'text' && part.content)
    .map((part) => part.content)
    .join('')
}

function VideoUnderstanding() {
  const [mode, setMode] = useState<Mode>('single-pass')
  const [input, setInput] = useState('')
  const [video, setVideo] = useState<UploadedVideo | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const body = useMemo(() => ({ video, mode }), [video, mode])

  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents('/api/video-understanding'),
    body,
  })

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadError(null)
    setUploading(true)
    setVideo(null)
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })

    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/video-understanding-upload', {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Upload failed')
      setVideo(json as UploadedVideo)
    } catch (err: any) {
      setUploadError(err?.message ?? 'Upload failed')
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading || !video) return
    sendMessage(input)
    setInput('')
  }

  const canChat = Boolean(video) && !uploading

  return (
    <div className="flex h-[calc(100vh-72px)] bg-gray-900 text-gray-100">
      {/* Left — video + controls */}
      <div className="w-2/5 flex flex-col border-r border-indigo-500/20 p-6 gap-4 overflow-y-auto">
        <div className="flex items-center gap-2 text-indigo-400">
          <Video size={20} />
          <h1 className="text-lg font-semibold">Video Understanding</h1>
        </div>

        {/* Video preview / upload dropzone */}
        {previewUrl ? (
          <video
            src={previewUrl}
            controls
            className="w-full rounded-lg border border-gray-700 bg-black"
          />
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 w-full h-48 rounded-lg border-2 border-dashed border-gray-600 text-gray-400 hover:border-indigo-500 hover:text-indigo-400 transition-colors"
          >
            <Upload size={28} />
            <span className="text-sm">Click to upload a video</span>
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleUpload}
          className="hidden"
        />

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 rounded-lg bg-gray-800 px-3 py-2 text-sm hover:bg-gray-700 disabled:opacity-50"
          >
            <Upload size={16} />
            {video ? 'Replace video' : 'Choose video'}
          </button>
          {uploading && (
            <span className="flex items-center gap-2 text-sm text-indigo-400">
              <Loader2 size={16} className="animate-spin" />
              Uploading & processing…
            </span>
          )}
          {video && !uploading && (
            <span className="text-sm text-green-400 truncate">
              Ready: {video.name}
            </span>
          )}
        </div>
        {uploadError && (
          <p className="text-sm text-red-400">Upload error: {uploadError}</p>
        )}

        {/* Mode toggle */}
        <div>
          <label className="text-sm text-gray-400 mb-2 block">
            Processing mode
          </label>
          <div className="flex gap-2">
            {(['single-pass', 'agentic'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  mode === m
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {m === 'agentic' ? 'Agentic' : 'Single-pass'}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {mode === 'agentic'
              ? 'Interactions API · processing: "agentic" on gemini-3.7-flash. Deeper, but slower — re-analyzes the video each turn.'
              : 'generateContent on gemini-3.7-flash (1 fps). Fast, good for multi-turn chat.'}
          </p>
        </div>
      </div>

      {/* Right — chat */}
      <div className="w-3/5 flex flex-col">
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
          {messages.length === 0 && (
            <p className="text-gray-500 text-sm">
              {video
                ? 'Ask a question about the video below.'
                : 'Upload a video to start chatting about it.'}
            </p>
          )}
          {messages.map(({ id, role, parts }) => {
            const text = getMessageText(parts)
            return (
              <div
                key={id}
                className={`rounded-lg px-4 py-3 text-sm whitespace-pre-wrap max-w-[85%] ${
                  role === 'assistant'
                    ? 'bg-gray-800 border border-indigo-500/20 self-start'
                    : 'bg-indigo-600/20 border border-indigo-500/30 self-end'
                }`}
              >
                <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                  {role}
                </div>
                {text || (
                  <span className="text-gray-500 italic">
                    {isLoading ? 'thinking…' : '(no content)'}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Composer */}
        <form
          onSubmit={handleSubmit}
          className="border-t border-gray-800 p-4 flex items-end gap-3"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e)
              }
            }}
            rows={2}
            placeholder={
              canChat ? 'Ask about the video…' : 'Upload a video first…'
            }
            disabled={!canChat}
            className="flex-1 resize-none rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!canChat || isLoading || !input.trim()}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

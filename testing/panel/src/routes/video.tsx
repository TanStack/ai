import { useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  AlertTriangle,
  Download,
  Loader2,
  RefreshCw,
  Video,
} from 'lucide-react'

// Supported sizes per OpenAI Sora API docs
type VideoSize = '1280x720' | '720x1280' | '1792x1024' | '1024x1792'
// Supported durations: 4, 8, or 12 seconds
type VideoSeconds = 4 | 8 | 12

interface VideoJob {
  jobId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress?: number
  url?: string
  error?: string
  expiresAt?: string
}

const SIZES: Array<{ value: VideoSize; label: string }> = [
  { value: '1280x720', label: '1280x720 (Landscape)' },
  { value: '720x1280', label: '720x1280 (Portrait)' },
  { value: '1792x1024', label: '1792x1024 (Wide Landscape)' },
  { value: '1024x1792', label: '1024x1792 (Tall Portrait)' },
]

const DURATIONS: Array<{ value: VideoSeconds; label: string }> = [
  { value: 4, label: '4 seconds' },
  { value: 8, label: '8 seconds' },
  { value: 12, label: '12 seconds' },
]

function VideoPage() {
  const [prompt, setPrompt] = useState(
    'A golden retriever puppy playing in a field of sunflowers on a sunny day, cinematic lighting',
  )
  const [size, setSize] = useState<VideoSize>('1280x720')
  const [seconds, setSeconds] = useState<VideoSeconds>(8)
  const [job, setJob] = useState<VideoJob | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resumeJobId, setResumeJobId] = useState('')
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [])

  const handleGenerate = async () => {
    setIsLoading(true)
    setError(null)
    setJob(null)

    // Stop any existing polling
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }

    try {
      const response = await fetch('/api/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          prompt,
          size,
          seconds,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create video job')
      }

      // Set initial job state
      setJob({
        jobId: data.jobId,
        status: 'pending',
      })

      // Start polling for status
      startPolling(data.jobId)
    } catch (err: any) {
      setError(err.message)
      setIsLoading(false)
    }
  }

  const handleResumeJob = async () => {
    if (!resumeJobId.trim()) return

    setIsLoading(true)
    setError(null)
    setJob(null)

    // Stop any existing polling
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }

    // Set initial job state with the provided ID
    setJob({
      jobId: resumeJobId.trim(),
      status: 'pending',
    })

    // Start polling for status
    startPolling(resumeJobId.trim())
  }

  const startPolling = (jobId: string) => {
    const poll = async () => {
      try {
        const response = await fetch('/api/video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'status',
            jobId,
          }),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to get status')
        }

        setJob((prev) => ({
          ...prev!,
          status: data.status,
          progress: data.progress,
          error: data.error,
        }))

        if (data.status === 'completed') {
          // Stop polling and get URL
          if (pollingRef.current) {
            clearInterval(pollingRef.current)
            pollingRef.current = null
          }
          await fetchVideoUrl(jobId)
          setIsLoading(false)
        } else if (data.status === 'failed') {
          // Stop polling
          if (pollingRef.current) {
            clearInterval(pollingRef.current)
            pollingRef.current = null
          }
          setError(data.error || 'Video generation failed')
          setIsLoading(false)
        }
      } catch (err: any) {
        console.error('Polling error:', err)
      }
    }

    // Poll immediately, then every 5 seconds
    poll()
    pollingRef.current = setInterval(poll, 5000)
  }

  const fetchVideoUrl = async (jobId: string) => {
    try {
      const response = await fetch('/api/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'url',
          jobId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get video URL')
      }

      setJob((prev) => ({
        ...prev!,
        url: data.url,
        expiresAt: data.expiresAt,
      }))
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleDownload = async () => {
    if (!job?.url) return

    try {
      const response = await fetch(job.url)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `generated-video-${job.jobId}.mp4`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to download video:', err)
    }
  }

  const getStatusColor = (status: VideoJob['status']) => {
    switch (status) {
      case 'pending':
        return 'text-yellow-400'
      case 'processing':
        return 'text-blue-400'
      case 'completed':
        return 'text-green-400'
      case 'failed':
        return 'text-red-400'
      default:
        return 'text-gray-400'
    }
  }

  return (
    <div className="min-h-[calc(100vh-72px)] bg-gray-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header with experimental warning */}
        <div className="flex items-center gap-3 mb-4">
          <Video className="w-8 h-8 text-purple-500" />
          <h1 className="text-2xl font-bold text-white">Video Generation</h1>
          <span className="px-2 py-1 text-xs font-medium text-yellow-400 bg-yellow-400/10 rounded-full border border-yellow-400/30">
            Experimental
          </span>
        </div>

        {/* Warning banner */}
        <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-200">
            <p className="font-medium">Experimental Feature</p>
            <p className="mt-1 text-yellow-200/80">
              Video generation using OpenAI Sora-2 is experimental and may
              require special API access. The API is subject to change without
              notice.
            </p>
          </div>
        </div>

        {/* Resume Job Section */}
        <div className="mb-6 p-4 bg-gray-800 border border-purple-500/20 rounded-lg">
          <h3 className="text-sm font-medium text-gray-300 mb-3">
            Resume Existing Job
          </h3>
          <div className="flex gap-3">
            <input
              type="text"
              value={resumeJobId}
              onChange={(e) => setResumeJobId(e.target.value)}
              disabled={isLoading}
              placeholder="Enter job ID (e.g., video_abc123...)"
              className="flex-1 rounded-lg border border-purple-500/20 bg-gray-900 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
            <button
              onClick={handleResumeJob}
              disabled={isLoading || !resumeJobId.trim()}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              {isLoading && job?.jobId === resumeJobId.trim() ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Resuming...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Resume
                </>
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Input Panel */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Size
                </label>
                <select
                  value={size}
                  onChange={(e) => setSize(e.target.value as VideoSize)}
                  disabled={isLoading}
                  className="w-full rounded-lg border border-purple-500/20 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                >
                  {SIZES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Duration
                </label>
                <select
                  value={seconds}
                  onChange={(e) =>
                    setSeconds(Number(e.target.value) as VideoSeconds)
                  }
                  disabled={isLoading}
                  className="w-full rounded-lg border border-purple-500/20 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                >
                  {DURATIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Prompt
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isLoading}
                rows={6}
                className="w-full rounded-lg border border-purple-500/20 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none"
                placeholder="Describe the video you want to generate..."
              />
            </div>

            <button
              onClick={handleGenerate}
              disabled={isLoading || !prompt.trim()}
              className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {job?.status === 'pending'
                    ? 'Queued...'
                    : job?.status === 'processing'
                      ? `Processing${job.progress ? ` (${job.progress}%)` : '...'}`
                      : 'Starting...'}
                </>
              ) : (
                'Generate Video'
              )}
            </button>

            {/* Job Status */}
            {job && (
              <div className="p-4 bg-gray-800 rounded-lg border border-purple-500/20">
                <h3 className="text-sm font-medium text-gray-300 mb-2">
                  Job Status
                </h3>
                <div className="space-y-2 text-sm">
                  <p className="text-gray-400">
                    Job ID:{' '}
                    <span className="text-gray-200 font-mono">{job.jobId}</span>
                  </p>
                  <p className="text-gray-400">
                    Status:{' '}
                    <span
                      className={`font-medium ${getStatusColor(job.status)}`}
                    >
                      {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                    </span>
                  </p>
                  {job.progress !== undefined &&
                    job.status === 'processing' && (
                      <div>
                        <p className="text-gray-400 mb-1">
                          Progress: {job.progress}%
                        </p>
                        <div className="w-full bg-gray-700 rounded-full h-2">
                          <div
                            className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                </div>
              </div>
            )}
          </div>

          {/* Output Panel */}
          <div className="lg:col-span-2 bg-gray-800 rounded-lg p-6 border border-purple-500/20">
            <h2 className="text-lg font-semibold text-white mb-4">
              Generated Video
            </h2>

            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 mb-4">
                {error}
              </div>
            )}

            {job?.url ? (
              <div className="space-y-4">
                <div className="relative group">
                  <video
                    src={job.url}
                    controls
                    className="w-full rounded-lg border border-gray-700"
                  >
                    Your browser does not support the video tag.
                  </video>
                  <button
                    onClick={handleDownload}
                    className="absolute top-2 right-2 p-2 bg-gray-900/80 hover:bg-gray-900 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Download video"
                  >
                    <Download className="w-4 h-4 text-white" />
                  </button>
                </div>
                <div className="pt-4 border-t border-gray-700 text-sm text-gray-400">
                  <p>
                    Model: <span className="text-purple-400">sora-2</span>
                  </p>
                  <p>
                    Size: <span className="text-purple-400">{size}</span>
                  </p>
                  <p>
                    Duration:{' '}
                    <span className="text-purple-400">{seconds}s</span>
                  </p>
                  {job.expiresAt && (
                    <p>
                      URL expires:{' '}
                      <span className="text-purple-400">
                        {new Date(job.expiresAt).toLocaleString()}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            ) : job?.status === 'processing' || job?.status === 'pending' ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <RefreshCw className="w-16 h-16 mb-4 opacity-50 animate-spin" />
                <p>Video is being generated...</p>
                <p className="text-sm mt-2">This may take several minutes.</p>
              </div>
            ) : !error && !isLoading ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <Video className="w-16 h-16 mb-4 opacity-50" />
                <p>
                  Enter a prompt and click "Generate Video" to create a video.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/video')({
  component: VideoPage,
})

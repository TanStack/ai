import { arrayBufferToBase64 } from '@tanstack/ai-utils'
import type { AudioPart } from '@tanstack/ai/client'

/** Lifecycle state of an {@link AudioRecorder}. */
export type AudioRecorderState = 'idle' | 'recording' | 'stopping'

export interface AudioRecorderOptions {
  /** Constraints forwarded to `getUserMedia({ audio })`. Defaults to `true`. */
  audio?: MediaTrackConstraints | boolean
  /**
   * Preferred recorder mime type. Used only when
   * `MediaRecorder.isTypeSupported` reports it; otherwise the browser default
   * is used.
   */
  mimeType?: string
  /** Fired once `stop()` finalizes with the completed recording. */
  onComplete?: (recording: AudioRecording) => void
  /** Fired on `getUserMedia` rejection (permission denied) or recorder error. */
  onError?: (error: Error) => void
}

export interface AudioRecording {
  /** The raw recorded media blob. */
  blob: Blob
  /** Base64 of the recorded bytes (no `data:` prefix). */
  base64: string
  /** The recorder's native mime type, e.g. `audio/webm;codecs=opus`. */
  mimeType: string
  /** Recording length in milliseconds. */
  durationMs: number
  /**
   * Ready-to-use audio content part for `sendMessage`/generation prompts:
   * `{ type: 'audio', source: { type: 'data', value: base64, mimeType } }`.
   */
  part: AudioPart
}

/**
 * Framework-agnostic browser audio recorder. Wraps `getUserMedia` +
 * `MediaRecorder`, returns the recorder's native output (no transcode), and
 * builds a plug-and-play {@link AudioRecording.part}.
 */
export class AudioRecorder {
  private readonly options: AudioRecorderOptions
  private recorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private chunks: Array<Blob> = []
  private startedAt = 0
  private _state: AudioRecorderState = 'idle'
  private readonly listeners = new Set<(state: AudioRecorderState) => void>()
  private stopResolve: ((recording: AudioRecording) => void) | null = null
  private stopReject: ((error: Error) => void) | null = null

  constructor(options: AudioRecorderOptions = {}) {
    this.options = options
  }

  /** Feature-detect the browser media APIs. SSR/Worker-safe. */
  static isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices !== 'undefined' &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      typeof MediaRecorder !== 'undefined'
    )
  }

  get state(): AudioRecorderState {
    return this._state
  }

  subscribe(cb: (state: AudioRecorderState) => void): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  private setState(state: AudioRecorderState): void {
    this._state = state
    for (const cb of this.listeners) {
      cb(state)
    }
  }

  async start(): Promise<void> {
    if (this._state !== 'idle') {
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: this.options.audio ?? true,
      })
      this.stream = stream
      const wanted = this.options.mimeType
      const useMimeType =
        wanted &&
        typeof MediaRecorder.isTypeSupported === 'function' &&
        MediaRecorder.isTypeSupported(wanted)
          ? wanted
          : undefined
      const recorder = useMimeType
        ? new MediaRecorder(stream, { mimeType: useMimeType })
        : new MediaRecorder(stream)
      this.chunks = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.chunks.push(e.data)
        }
      }
      recorder.onstop = () => {
        void this.finalize()
      }
      recorder.onerror = (event) => {
        const detail =
          event instanceof ErrorEvent && event.error instanceof Error
            ? event.error
            : new Error('Audio recording failed')
        this.handleError(detail)
      }
      this.recorder = recorder
      this.startedAt = Date.now()
      recorder.start()
      this.setState('recording')
    } catch (err) {
      this.releaseStream()
      this.recorder = null
      const error =
        err instanceof Error ? err : new Error('Failed to start recording')
      this.options.onError?.(error)
      this.setState('idle')
      throw error
    }
  }

  stop(): Promise<AudioRecording> {
    if (this._state !== 'recording' || !this.recorder) {
      return Promise.reject(
        new Error('AudioRecorder.stop() called while not recording'),
      )
    }
    this.setState('stopping')
    const recorder = this.recorder
    return new Promise<AudioRecording>((resolve, reject) => {
      this.stopResolve = resolve
      this.stopReject = reject
      recorder.stop()
    })
  }

  cancel(): void {
    if (this._state === 'idle') {
      return
    }
    const recorder = this.recorder
    if (recorder) {
      // Detach onstop so finalize() never runs for a discarded recording.
      recorder.onstop = null
      try {
        recorder.stop()
      } catch {
        // Recorder may already be inactive; nothing to do.
      }
    }
    this.releaseStream()
    this.recorder = null
    this.chunks = []
    const reject = this.stopReject
    this.stopResolve = null
    this.stopReject = null
    this.setState('idle')
    reject?.(new Error('Recording cancelled'))
  }

  private async finalize(): Promise<void> {
    const mimeType = this.recorder?.mimeType || 'audio/webm'
    const durationMs = Date.now() - this.startedAt
    try {
      const blob = new Blob(this.chunks, { type: mimeType })
      const base64 = arrayBufferToBase64(await blob.arrayBuffer())
      const recording: AudioRecording = {
        blob,
        base64,
        mimeType,
        durationMs,
        part: {
          type: 'audio',
          source: { type: 'data', value: base64, mimeType },
        },
      }
      this.releaseStream()
      this.recorder = null
      this.chunks = []
      const resolve = this.stopResolve
      this.stopResolve = null
      this.stopReject = null
      this.setState('idle')
      this.options.onComplete?.(recording)
      resolve?.(recording)
    } catch (err) {
      this.handleError(
        err instanceof Error ? err : new Error('Failed to finalize recording'),
      )
    }
  }

  private handleError(error: Error): void {
    this.releaseStream()
    this.recorder = null
    this.chunks = []
    const reject = this.stopReject
    this.stopResolve = null
    this.stopReject = null
    this.setState('idle')
    this.options.onError?.(error)
    reject?.(error)
  }

  private releaseStream(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
  }
}

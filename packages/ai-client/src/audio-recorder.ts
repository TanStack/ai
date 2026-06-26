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
  /** Fired on `getUserMedia` rejection (permission denied) or recorder error. */
  onError?: (error: Error) => void
}

/**
 * Resolves the value `stop()` produces from a recorder transform callback.
 *
 * - If the callback returns a concrete (non-null/void) value — sync or async —
 *   that value's awaited type is used.
 * - If the callback returns only null/void/undefined, or is absent, falls back
 *   to {@link AudioRecording}.
 *
 * @template TFn - The transform callback type (or undefined if not provided)
 */
export type InferAudioRecordingOutput<TFn> = TFn extends (
  recording: AudioRecording,
) => infer R
  ? [Exclude<Awaited<R>, null | void | undefined>] extends [never]
    ? AudioRecording
    : Exclude<Awaited<R>, null | void | undefined>
  : AudioRecording

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
  // True while start() is awaiting getUserMedia (state is still 'idle' then).
  private starting = false
  // Set by cancel()/teardown during that window so start() releases the
  // freshly acquired stream instead of beginning a leaked recording.
  private pendingCancel = false
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
    if (this._state !== 'idle' || this.starting) {
      return
    }
    this.starting = true
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: this.options.audio ?? true,
      })
      // cancel()/teardown ran while we were awaiting the mic: release the
      // freshly acquired stream and bail rather than starting a recording the
      // caller can no longer stop (a leaked live microphone).
      if (this.pendingCancel) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
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
          'error' in event && event.error instanceof Error
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
    } finally {
      this.starting = false
      // Reset here (not before the await) so a cancel() that arrives mid-start
      // is observed above; clearing it afterward keeps the next start() clean.
      this.pendingCancel = false
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
      // Some browsers/codecs never fire onstop; this watchdog unwedges the
      // recorder instead of leaking this promise forever.
      const watchdog = setTimeout(() => {
        if (this._state !== 'stopping') {
          return
        }
        // Detach handlers so a late onstop/onerror from the stalled recorder
        // can't reach back in and fire finalize()/onError a second time.
        this.detachRecorder()
        if (this.chunks.length > 0) {
          // onstop never fired, but ondataavailable already delivered the
          // audio — finalize from the buffered chunks rather than discarding a
          // recording the user successfully captured.
          void this.finalize()
        } else {
          this.handleError(
            new Error('Recording stop timed out after 10s with no audio'),
          )
        }
      }, 10_000)
      this.stopResolve = (rec) => {
        clearTimeout(watchdog)
        resolve(rec)
      }
      this.stopReject = (err) => {
        clearTimeout(watchdog)
        reject(err)
      }
      recorder.stop()
    })
  }

  cancel(): void {
    if (this.starting) {
      // A start() is awaiting getUserMedia; flag it so the resolved stream is
      // released instead of beginning a recording with no handle to stop it.
      this.pendingCancel = true
      return
    }
    if (this._state === 'idle') {
      return
    }
    const recorder = this.recorder
    if (recorder) {
      // Detach handlers so finalize()/onError never run for a discarded
      // recording.
      this.detachRecorder()
      try {
        recorder.stop()
      } catch (err) {
        // Stopping an already-inactive recorder throws InvalidStateError —
        // that's expected here. Anything else is unexpected; surface it rather
        // than swallowing it silently.
        if (
          !(err instanceof DOMException && err.name === 'InvalidStateError')
        ) {
          this.options.onError?.(
            err instanceof Error ? err : new Error('Failed to stop recorder'),
          )
        }
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

  /** Detach all event handlers so a stale recorder can't mutate our state. */
  private detachRecorder(): void {
    const recorder = this.recorder
    if (!recorder) {
      return
    }
    recorder.onstop = null
    recorder.onerror = null
    recorder.ondataavailable = null
  }
}

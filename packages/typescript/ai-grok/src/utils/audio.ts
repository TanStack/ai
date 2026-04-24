/**
 * Coerce the various audio input shapes accepted by `TranscriptionOptions.audio`
 * into a `File` suitable for `multipart/form-data` uploads.
 *
 * For base64 string inputs we require an explicit MIME type — either via a
 * `data:<mime>;base64,<payload>` URI prefix, or via the caller-provided
 * `audioFormat` parameter. Bare base64 without either is rejected, because
 * silently defaulting to `audio/mpeg` misreports non-mp3 audio to the server.
 *
 * The same rule applies to raw `ArrayBuffer` inputs: the caller must supply
 * an `audioFormat` so we know what MIME type and extension to use.
 */
export function toAudioFile(
  audio: string | File | Blob | ArrayBuffer,
  audioFormat?: string,
): File {
  if (typeof File !== 'undefined' && audio instanceof File) {
    return audio
  }

  if (typeof Blob !== 'undefined' && audio instanceof Blob) {
    return new File([audio], `audio.${extensionFor(audio.type)}`, {
      type: audio.type || 'application/octet-stream',
    })
  }

  if (audio instanceof ArrayBuffer) {
    if (!audioFormat) {
      throw new Error(
        'toAudioFile cannot infer type for ArrayBuffer input — pass an explicit audioFormat (e.g. "mp3", "wav", "audio/mpeg")',
      )
    }
    const mimeType = toMimeType(audioFormat)
    return new File([audio], `audio.${extensionFor(mimeType)}`, {
      type: mimeType,
    })
  }

  if (typeof audio === 'string') {
    if (audio.startsWith('data:')) {
      const [header, base64Data = ''] = audio.split(',')
      const mimeType = header?.match(/data:([^;]+)/)?.[1] || 'audio/mpeg'
      const buffer = base64ToArrayBuffer(base64Data)
      return new File([buffer], `audio.${extensionFor(mimeType)}`, {
        type: mimeType,
      })
    }

    if (!audioFormat) {
      throw new Error(
        'toAudioFile requires a data: URI (e.g. data:audio/wav;base64,...) or an explicit audioFormat argument — bare base64 strings have no MIME type to infer',
      )
    }

    const buffer = base64ToArrayBuffer(audio)
    const mimeType = toMimeType(audioFormat)
    return new File([buffer], `audio.${extensionFor(mimeType)}`, {
      type: mimeType,
    })
  }

  throw new Error('Invalid audio input type')
}

function toMimeType(audioFormat: string): string {
  // Accept either "audio/…" strings or bare extensions like "mp3".
  if (audioFormat.includes('/')) return audioFormat
  const ext = audioFormat.toLowerCase()
  switch (ext) {
    case 'mp3':
      return 'audio/mpeg'
    case 'wav':
      return 'audio/wav'
    case 'ogg':
      return 'audio/ogg'
    case 'opus':
      return 'audio/opus'
    case 'flac':
      return 'audio/flac'
    case 'aac':
      return 'audio/aac'
    case 'mp4':
      return 'audio/mp4'
    case 'm4a':
      return 'audio/mp4'
    case 'webm':
      return 'audio/webm'
    case 'pcm':
      return 'audio/L16'
    case 'mulaw':
      return 'audio/basic'
    case 'alaw':
      return 'audio/x-alaw-basic'
    default:
      return `audio/${ext}`
  }
}

function extensionFor(mimeType: string): string {
  switch (mimeType) {
    case 'audio/mpeg':
      return 'mp3'
    case 'audio/wav':
    case 'audio/x-wav':
      return 'wav'
    case 'audio/ogg':
      return 'ogg'
    case 'audio/opus':
      return 'opus'
    case 'audio/flac':
      return 'flac'
    case 'audio/aac':
      return 'aac'
    case 'audio/mp4':
      return 'm4a'
    case 'audio/webm':
      return 'webm'
    case 'audio/L16':
      return 'pcm'
    default: {
      const slash = mimeType.indexOf('/')
      if (slash === -1) return 'bin'
      return mimeType.slice(slash + 1) || 'bin'
    }
  }
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  let binary: string
  try {
    binary = atob(base64)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid base64 input to toAudioFile: ${msg}`)
  }
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return buffer
}

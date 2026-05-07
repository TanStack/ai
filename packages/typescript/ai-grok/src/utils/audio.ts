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
    // Prefer the caller-supplied `audioFormat` over a potentially empty or
    // incorrect `File.type` — callers pass `audioFormat` precisely because
    // they have more context than the browser does about the payload. If
    // neither is set, fall through to the Blob-style error path below.
    if (audioFormat) {
      const mimeType = toMimeType(audioFormat)
      return new File([audio], `audio.${extensionFor(mimeType)}`, {
        type: mimeType,
      })
    }
    if (audio.type) {
      return audio
    }
    throw new Error(
      'toAudioFile cannot infer type for File input with empty .type — pass an explicit audioFormat (e.g. "mp3", "wav", "audio/mpeg")',
    )
  }

  if (typeof Blob !== 'undefined' && audio instanceof Blob) {
    // Mirror the ArrayBuffer / bare-base64 paths: prefer the explicit
    // audioFormat argument over the Blob's (often empty) .type. We refuse to
    // fall back to `application/octet-stream` because that mislabels audio
    // for the server.
    const mimeType = audioFormat
      ? toMimeType(audioFormat)
      : audio.type || undefined
    if (!mimeType) {
      throw new Error(
        'toAudioFile cannot infer type for Blob input with empty .type — pass an explicit audioFormat (e.g. "mp3", "wav", "audio/mpeg")',
      )
    }
    return new File([audio], `audio.${extensionFor(mimeType)}`, {
      type: mimeType,
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
      const [header, base64Data] = audio.split(',')
      // Fail loudly on malformed data: URIs instead of silently defaulting
      // to `audio/mpeg` — the file's contract is that we never mislabel
      // audio for the server.
      const headerMatch = header?.match(/data:([^;]+)/)
      const uriMimeType = headerMatch?.[1]
      if (!uriMimeType) {
        throw new Error(
          'Malformed data: URI in toAudioFile: cannot parse MIME type — expected data:<mime>[;charset=…][;base64],<payload>',
        )
      }
      if (base64Data === undefined || base64Data.trim() === '') {
        throw new Error(
          'Malformed data: URI in toAudioFile: missing base64 payload after comma',
        )
      }
      // Caller-supplied `audioFormat` wins over the URI-embedded MIME: the
      // caller has more context (the URI MIME may be wrong, or a generic
      // `application/octet-stream`).
      const mimeType = audioFormat ? toMimeType(audioFormat) : uriMimeType
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
    case 'audio/basic':
      return 'mulaw'
    case 'audio/x-alaw-basic':
      return 'alaw'
    default: {
      const slash = mimeType.indexOf('/')
      if (slash === -1) return 'bin'
      return mimeType.slice(slash + 1) || 'bin'
    }
  }
}

/**
 * Cross-runtime ArrayBuffer → base64 conversion.
 *
 * Uses Node's `Buffer` when available (fastest path on server) and falls
 * back to `btoa` + chunked `String.fromCharCode` everywhere else (browser,
 * Cloudflare Workers, Bun, Deno). Chunking is required because a very
 * large audio buffer spread into `String.fromCharCode(...bytes)` in one
 * call can hit `Maximum call stack size exceeded`.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buffer).toString('base64')
  }
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, bytes.length)
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, end) as unknown as Array<number>,
    )
  }
  return btoa(binary)
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

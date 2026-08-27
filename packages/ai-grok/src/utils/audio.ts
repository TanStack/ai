function audioFileFromBytes(bytes: BlobPart, mimeType: string): File {
  return new File([bytes], `audio.${extensionFor(mimeType)}`, {
    type: mimeType,
  })
}

function audioFileFromString(audio: string, audioFormat?: string): File {
  if (audio.startsWith('data:')) {
    const [header, base64Data] = audio.split(',')
    const headerMatch = header?.match(/data:([^;]+)/)
    const uriMimeType = headerMatch?.[1]
    if (!uriMimeType) {
      throw new Error(
        'Malformed data: URI in toAudioFile: cannot parse MIME type — expected data:<mime>[;charset=…][;base64],<payload>',
      )
    }
    if (base64Data === undefined) {
      throw new Error(
        'Malformed data: URI in toAudioFile: missing base64 payload after comma',
      )
    }
    if (base64Data.trim() === '') {
      throw new Error(
        'Malformed data: URI in toAudioFile: missing base64 payload after comma',
      )
    }
    const mimeType = audioFormat ? toMimeType(audioFormat) : uriMimeType
    return audioFileFromBytes(base64ToArrayBuffer(base64Data), mimeType)
  }

  if (!audioFormat) {
    throw new Error(
      'toAudioFile requires a data: URI (e.g. data:audio/wav;base64,...) or an explicit audioFormat argument — bare base64 strings have no MIME type to infer',
    )
  }

  return audioFileFromBytes(base64ToArrayBuffer(audio), toMimeType(audioFormat))
}

export function toAudioFile(
  audio: string | File | Blob | ArrayBuffer,
  audioFormat?: string,
): File {
  if (typeof File !== 'undefined' && audio instanceof File) {
    if (audioFormat) {
      return audioFileFromBytes(audio, toMimeType(audioFormat))
    }
    if (audio.type) {
      return audio
    }
    throw new Error(
      'toAudioFile cannot infer type for File input with empty .type — pass an explicit audioFormat (e.g. "mp3", "wav", "audio/mpeg")',
    )
  }

  if (typeof Blob !== 'undefined' && audio instanceof Blob) {
    const mimeType = audioFormat
      ? toMimeType(audioFormat)
      : audio.type || undefined
    if (!mimeType) {
      throw new Error(
        'toAudioFile cannot infer type for Blob input with empty .type — pass an explicit audioFormat (e.g. "mp3", "wav", "audio/mpeg")',
      )
    }
    return audioFileFromBytes(audio, mimeType)
  }

  if (audio instanceof ArrayBuffer) {
    if (!audioFormat) {
      throw new Error(
        'toAudioFile cannot infer type for ArrayBuffer input — pass an explicit audioFormat (e.g. "mp3", "wav", "audio/mpeg")',
      )
    }
    return audioFileFromBytes(audio, toMimeType(audioFormat))
  }

  if (typeof audio === 'string') {
    return audioFileFromString(audio, audioFormat)
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
      // oxlint-disable-next-line eslint-js/no-restricted-syntax -- TS lib types String.fromCharCode.apply as Array<number> but runtime accepts any ArrayLike
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

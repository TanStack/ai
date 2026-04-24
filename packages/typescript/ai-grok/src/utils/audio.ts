/**
 * Coerce the various audio input shapes accepted by `TranscriptionOptions.audio`
 * into a `File` suitable for `multipart/form-data` uploads.
 */
export function toAudioFile(audio: string | File | Blob | ArrayBuffer): File {
  if (typeof File !== 'undefined' && audio instanceof File) {
    return audio
  }

  if (typeof Blob !== 'undefined' && audio instanceof Blob) {
    return new File([audio], 'audio.mp3', {
      type: audio.type || 'audio/mpeg',
    })
  }

  if (audio instanceof ArrayBuffer) {
    return new File([audio], 'audio.mp3', { type: 'audio/mpeg' })
  }

  if (typeof audio === 'string') {
    if (audio.startsWith('data:')) {
      const [header, base64Data = ''] = audio.split(',')
      const mimeType = header?.match(/data:([^;]+)/)?.[1] || 'audio/mpeg'
      const buffer = base64ToArrayBuffer(base64Data)
      const extension = mimeType.split('/')[1] || 'mp3'
      return new File([buffer], `audio.${extension}`, { type: mimeType })
    }

    const buffer = base64ToArrayBuffer(audio)
    return new File([buffer], 'audio.mp3', { type: 'audio/mpeg' })
  }

  throw new Error('Invalid audio input type')
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return buffer
}

import type { AudioInput } from '../types'

/**
 * MIME type mapping for common audio file extensions.
 */
const AUDIO_MIME_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  mpeg: 'audio/mpeg',
  mpga: 'audio/mpeg',
  mp4: 'audio/mp4',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  aac: 'audio/aac',
  aiff: 'audio/aiff',
}

/**
 * Result of normalizing audio input.
 */
export interface NormalizedAudioInput {
  /** The audio data as a Blob or File */
  data: Blob | File
  /** The MIME type of the audio */
  mimeType: string
  /** Original filename if available */
  filename?: string
}

/**
 * Infers the MIME type from a filename extension.
 * @param filename - The filename to extract extension from
 * @returns The MIME type or undefined if not recognized
 */
function inferMimeTypeFromFilename(filename: string): string | undefined {
  const ext = filename.split('.').pop()?.toLowerCase()
  return ext ? AUDIO_MIME_TYPES[ext] : undefined
}

/**
 * Extracts MIME type and data from a base64 data URL.
 * @param dataUrl - The data URL string (e.g., "data:audio/mp3;base64,...")
 * @returns Object with mimeType and base64 data, or null if invalid
 */
function parseDataUrl(
  dataUrl: string,
): { mimeType: string; base64Data: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match || !match[1] || !match[2]) return null
  return {
    mimeType: match[1],
    base64Data: match[2],
  }
}

/**
 * Converts a base64 string to a Uint8Array.
 * Works in both browser and Node.js environments.
 */
function base64ToUint8Array(base64: string): Uint8Array {
  // Browser environment
  if (typeof atob === 'function') {
    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes
  }

  // Node.js environment
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'))
  }

  throw new Error(
    'Unable to decode base64: neither atob nor Buffer are available',
  )
}

/**
 * Reads a file from the filesystem (Node.js only).
 * @param filePath - The path to the file
 * @returns Promise resolving to the file contents as Uint8Array and inferred MIME type
 */
async function readFileFromPath(
  filePath: string,
): Promise<{ data: Uint8Array; mimeType: string; filename: string }> {
  // Dynamic import for Node.js fs module
  const fs = await import('node:fs/promises')
  const path = await import('node:path')

  const data = await fs.readFile(filePath)
  const filename = path.basename(filePath)
  const mimeType = inferMimeTypeFromFilename(filename) || 'audio/mpeg'

  return {
    data: new Uint8Array(data),
    mimeType,
    filename,
  }
}

/**
 * Checks if a string looks like a file path (not a data URL).
 */
function isFilePath(str: string): boolean {
  // Data URLs start with "data:"
  if (str.startsWith('data:')) return false
  // HTTP URLs
  if (str.startsWith('http://') || str.startsWith('https://')) return false
  // Likely a file path if it contains path separators or common file extensions
  return (
    str.includes('/') ||
    str.includes('\\') ||
    /\.(mp3|wav|m4a|ogg|flac|webm|aac|aiff|mp4|mpeg|mpga)$/i.test(str)
  )
}

/**
 * Normalizes various audio input formats into a consistent Blob/File format.
 *
 * Supports:
 * - File objects (pass-through)
 * - Blob objects (pass-through)
 * - ArrayBuffer (wrapped in Blob)
 * - Buffer (Node.js, wrapped in Blob)
 * - Base64 data URL string (decoded to Blob)
 * - File path string (Node.js, read from filesystem)
 *
 * @param input - The audio input in any supported format
 * @returns Promise resolving to normalized audio data with MIME type
 *
 * @example
 * ```typescript
 * // From File object
 * const result = await normalizeAudioInput(fileInput);
 *
 * // From base64 data URL
 * const result = await normalizeAudioInput('data:audio/mp3;base64,...');
 *
 * // From file path (Node.js)
 * const result = await normalizeAudioInput('/path/to/audio.mp3');
 * ```
 */
export async function normalizeAudioInput(
  input: AudioInput,
): Promise<NormalizedAudioInput> {
  // Handle File objects (browser)
  if (typeof File !== 'undefined' && input instanceof File) {
    const mimeType =
      input.type || inferMimeTypeFromFilename(input.name) || 'audio/mpeg'
    return {
      data: input,
      mimeType,
      filename: input.name,
    }
  }

  // Handle Blob objects
  if (input instanceof Blob) {
    return {
      data: input,
      mimeType: input.type || 'audio/mpeg',
    }
  }

  // Handle ArrayBuffer
  if (input instanceof ArrayBuffer) {
    const blob = new Blob([input], { type: 'audio/mpeg' })
    return {
      data: blob,
      mimeType: 'audio/mpeg',
    }
  }

  // Handle Node.js Buffer
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(input)) {
    // Cast through unknown to handle cross-environment type differences
    const blob = new Blob([new Uint8Array(input).buffer], {
      type: 'audio/mpeg',
    })
    return {
      data: blob,
      mimeType: 'audio/mpeg',
    }
  }

  // Handle string inputs
  if (typeof input === 'string') {
    // Base64 data URL
    const parsed = parseDataUrl(input)
    if (parsed) {
      const bytes = base64ToUint8Array(parsed.base64Data)
      // Use ArrayBuffer assertion to avoid cross-environment type issues
      const blob = new Blob([bytes.buffer as ArrayBuffer], {
        type: parsed.mimeType,
      })
      return {
        data: blob,
        mimeType: parsed.mimeType,
      }
    }

    // File path (Node.js only)
    if (isFilePath(input)) {
      try {
        const { data, mimeType, filename } = await readFileFromPath(input)
        // Use ArrayBuffer assertion to avoid cross-environment type issues
        const blob = new Blob([data.buffer as ArrayBuffer], { type: mimeType })
        return {
          data: blob,
          mimeType,
          filename,
        }
      } catch (error) {
        throw new Error(
          `Failed to read audio file from path "${input}": ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
      }
    }

    throw new Error(
      `Invalid audio input string. Expected a base64 data URL (data:audio/...;base64,...) or a file path, got: ${input.slice(0, 50)}...`,
    )
  }

  throw new Error(
    `Unsupported audio input type: ${typeof input}. Expected File, Blob, ArrayBuffer, Buffer, or string.`,
  )
}

/**
 * Converts normalized audio input to a File object suitable for FormData.
 * This is useful for APIs that require File objects (like OpenAI).
 *
 * @param normalized - The normalized audio input
 * @param defaultFilename - Default filename if none is available
 * @returns A File object
 */
export function toFile(
  normalized: NormalizedAudioInput,
  defaultFilename = 'audio.mp3',
): File {
  if (typeof File !== 'undefined' && normalized.data instanceof File) {
    return normalized.data
  }

  const filename = normalized.filename || defaultFilename
  return new File([normalized.data], filename, { type: normalized.mimeType })
}

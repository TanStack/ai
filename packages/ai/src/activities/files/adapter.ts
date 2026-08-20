/**
 * Files Adapter
 *
 * Base class and interface for the `files` activity — a provider's native Files
 * API (upload a media asset once, reference it later by the returned handle
 * instead of re-sending base64 or a public URL each request).
 *
 * Providers with a native surface expose a factory (`openaiFiles()`,
 * `anthropicFiles()`, `geminiFiles()`, `falFiles()`). `upload` is required;
 * `get`/`delete` are optional because not every provider has a lifecycle API
 * (fal's storage is upload-only).
 */

import { base64ToArrayBuffer } from '@tanstack/ai-utils'

/**
 * Input to {@link FilesAdapter.upload}. Either a `Blob` (memory-efficient,
 * preferred for large assets) or base64 `data` plus its `mimeType`.
 */
export type FileUploadInput =
  | Blob
  | {
      /** Base64-encoded file bytes. */
      data: string
      /** MIME type of the bytes (e.g. `'image/png'`, `'application/pdf'`). */
      mimeType: string
      /** Optional filename hint sent to providers that accept one. */
      filename?: string
    }

/**
 * A provider-issued file handle returned by {@link FilesAdapter.upload} /
 * {@link FilesAdapter.get}. Reference it in a message via a `{ type: 'file' }`
 * content source — use {@link fileSourceFromHandle} to build one.
 */
export interface FileHandle {
  /**
   * Provider handle used for lifecycle operations (`get`/`delete`): the
   * OpenAI/Anthropic `file_id`, the Gemini file resource name (`files/...`), or
   * the fal storage URL.
   */
  id: string
  /** The provider that issued the handle (`'openai'`, `'gemini'`, ...). */
  provider: string
  /**
   * The handle's URL form when the provider exposes one (Gemini file URI, fal
   * storage URL). For providers whose handle is an opaque id (OpenAI,
   * Anthropic) this is `undefined`.
   */
  uri?: string
  /** MIME type reported by the provider (or echoed from the upload input). */
  mimeType?: string
  /** File size in bytes when the provider reports it. */
  sizeBytes?: number
  /** Expiry as epoch milliseconds when the handle is scheduled to expire. */
  expiresAt?: number
  /** Original filename when the provider reports it. */
  filename?: string
}

/**
 * The `files` adapter contract. `upload` is required; `get`/`delete` are
 * optional and present only when the provider has a lifecycle API.
 */
export interface FilesAdapter {
  readonly kind: 'files'
  readonly name: string
  upload: (input: FileUploadInput) => Promise<FileHandle>
  get?: (id: string) => Promise<FileHandle>
  delete?: (id: string) => Promise<void>
}

export type AnyFilesAdapter = FilesAdapter

/**
 * Normalize a {@link FileUploadInput} to a `Blob` (plus best-effort MIME /
 * filename) so provider adapters can hand it straight to their SDK. A `Blob`
 * input passes through; base64 `{ data }` is decoded to bytes. Shared so the
 * four provider files adapters don't each re-implement the decode.
 */
export function normalizeFileUploadInput(input: FileUploadInput): {
  blob: Blob
  mimeType?: string
  filename?: string
} {
  if (input instanceof Blob) {
    return { blob: input, mimeType: input.type || undefined }
  }
  const bytes = base64ToArrayBuffer(input.data)
  return {
    blob: new Blob([bytes], { type: input.mimeType }),
    mimeType: input.mimeType,
    filename: input.filename,
  }
}

/**
 * Abstract base for provider files adapters. Subclasses set `name`, implement
 * `upload`, and optionally implement `get`/`delete`.
 */
export abstract class BaseFilesAdapter implements FilesAdapter {
  readonly kind = 'files' as const
  abstract readonly name: string

  abstract upload(input: FileUploadInput): Promise<FileHandle>
}

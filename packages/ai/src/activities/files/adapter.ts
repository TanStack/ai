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
 * content source — use `fileSourceFromHandle` to build one.
 *
 * `TProvider` carries the issuing provider's name as a literal (`'openai'`,
 * `'gemini'`, ...) when the handle came from a concrete files adapter, so
 * cross-provider lifecycle calls (`deleteFile` with a foreign handle) fail at
 * compile time. It defaults to `string` so wire-deserialized handles still fit.
 */
export interface FileHandle<TProvider extends string = string> {
  /**
   * Provider handle used for lifecycle operations (`get`/`delete`): the
   * OpenAI/Anthropic `file_id`, the Gemini file resource name (`files/...`), or
   * the fal storage URL (fal itself has no lifecycle API — the URL doubles as
   * the wire reference).
   */
  id: string
  /** The provider that issued the handle (`'openai'`, `'gemini'`, ...). */
  provider: TProvider
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
 *
 * `TName` is the provider name literal (`'openai'`, `'gemini'`, ...); concrete
 * adapters bind it so the handles they issue carry their provenance in the
 * type system.
 */
export interface FilesAdapter<TName extends string = string> {
  readonly kind: 'files'
  readonly name: TName
  upload: (input: FileUploadInput) => Promise<FileHandle<TName>>
  get?: (id: string) => Promise<FileHandle<TName>>
  delete?: (id: string) => Promise<void>
}

export type AnyFilesAdapter = FilesAdapter<string>

/**
 * Normalize a {@link FileUploadInput} to a `Blob` (plus best-effort MIME /
 * filename) so provider adapters can hand it straight to their SDK. A `Blob`
 * input passes through; base64 `{ data }` is decoded to bytes. Shared so
 * provider files adapters don't each re-implement the decode.
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
 * Abstract base for provider files adapters. Subclasses bind `TName` to their
 * provider literal, set `name`, implement `upload`, and may add `get`/`delete`
 * (declared on {@link FilesAdapter}, not here, since not every provider has a
 * lifecycle API).
 */
export abstract class BaseFilesAdapter<
  TName extends string = string,
> implements FilesAdapter<TName> {
  readonly kind = 'files' as const
  abstract readonly name: TName

  abstract upload(input: FileUploadInput): Promise<FileHandle<TName>>
}

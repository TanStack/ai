/**
 * Files Activity
 *
 * Dispatch functions for provider Files APIs. Each takes `{ adapter, ... }` and
 * calls the adapter method directly (mirrors the other activity dispatchers).
 * `get`/`delete` are optional on the adapter; the dispatchers throw a clear
 * error when the selected provider has no lifecycle API.
 */

import type { ContentPartFileSource } from '../../types'
import type { AnyFilesAdapter, FileHandle, FileUploadInput } from './adapter'

/** The adapter kind this activity handles */
export const kind = 'files' as const

/**
 * Upload a file to a provider's Files API and return its handle.
 *
 * @example
 * ```ts
 * const files = openaiFiles()
 * const handle = await uploadFile({ adapter: files, input: { data, mimeType: 'image/png' } })
 * ```
 */
export async function uploadFile<TAdapter extends AnyFilesAdapter>(options: {
  adapter: TAdapter & { kind: typeof kind }
  input: FileUploadInput
}): Promise<FileHandle> {
  return options.adapter.upload(options.input)
}

/**
 * Fetch metadata for a previously uploaded file by its handle id.
 *
 * @throws if the provider's files adapter has no `get` (e.g. fal storage).
 */
export async function getFile<TAdapter extends AnyFilesAdapter>(options: {
  adapter: TAdapter & { kind: typeof kind }
  id: string
}): Promise<FileHandle> {
  const { adapter, id } = options
  if (!adapter.get) {
    throw new Error(
      `${adapter.name}: files adapter does not support get() — this provider ` +
        `has no file-retrieval API.`,
    )
  }
  return adapter.get(id)
}

/**
 * Delete a previously uploaded file by its handle id.
 *
 * @throws if the provider's files adapter has no `delete` (e.g. fal storage).
 */
export async function deleteFile<TAdapter extends AnyFilesAdapter>(options: {
  adapter: TAdapter & { kind: typeof kind }
  id: string
}): Promise<void> {
  const { adapter, id } = options
  if (!adapter.delete) {
    throw new Error(
      `${adapter.name}: files adapter does not support delete() — this ` +
        `provider has no file-deletion API.`,
    )
  }
  return adapter.delete(id)
}

/**
 * Build a `{ type: 'file' }` content source from an uploaded {@link FileHandle},
 * for use in a chat message (image/audio/document part `source`).
 *
 * Picks the right `value`: the handle URL when the provider exposes one
 * (Gemini/fal), otherwise the opaque id (OpenAI/Anthropic).
 *
 * @example
 * ```ts
 * const handle = await uploadFile({ adapter: openaiFiles(), input })
 * messages.push({ role: 'user', content: [
 *   { type: 'image', source: fileSourceFromHandle(handle) },
 * ] })
 * ```
 */
export function fileSourceFromHandle(
  handle: FileHandle,
): ContentPartFileSource {
  return {
    type: 'file',
    value: handle.uri ?? handle.id,
    provider: handle.provider,
    ...(handle.mimeType ? { mimeType: handle.mimeType } : {}),
  }
}

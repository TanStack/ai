/**
 * Files Activity
 *
 * Dispatch functions for provider Files APIs. Each takes `{ adapter, ... }` and
 * calls the adapter method directly (mirrors the other activity dispatchers).
 * `get`/`delete` are optional on the adapter; the dispatchers throw a clear
 * error when the selected provider has no lifecycle API.
 */

import type { ContentPartFileSource } from '../../types'
import type { FileHandle, FileUploadInput, FilesAdapter } from './adapter'

/** The adapter kind this activity handles */
export const kind = 'files' as const

/**
 * Upload a file to a provider's Files API and return its handle. The handle
 * carries the provider name as a literal type, so passing it to another
 * provider's lifecycle call is a compile error.
 *
 * @example
 * ```ts
 * const files = openaiFiles()
 * const handle = await uploadFile({ adapter: files, input: { data, mimeType: 'image/png' } })
 * ```
 */
export async function uploadFile<TName extends string>(options: {
  adapter: FilesAdapter<TName> & { kind: typeof kind }
  input: FileUploadInput
}): Promise<FileHandle<TName>> {
  return options.adapter.upload(options.input)
}

/**
 * Resolve a lifecycle id from either a raw id string or a {@link FileHandle}
 * (whose `id` — not its `uri`/wire value — is the lifecycle currency).
 */
function toLifecycleId(id: string | FileHandle): string {
  return typeof id === 'string' ? id : id.id
}

/**
 * Fetch metadata for a previously uploaded file. Accepts the handle itself
 * (preferred — the provider-literal type rejects a foreign provider's handle
 * at compile time) or its raw lifecycle id.
 *
 * @throws if the provider's files adapter has no `get` (e.g. fal storage).
 */
export async function getFile<TName extends string>(options: {
  adapter: FilesAdapter<TName> & { kind: typeof kind }
  id: string | FileHandle<TName>
}): Promise<FileHandle<TName>> {
  const { adapter } = options
  if (!adapter.get) {
    throw new Error(
      `${adapter.name}: files adapter does not support get() — this provider ` +
        `has no file-retrieval API.`,
    )
  }
  return adapter.get(toLifecycleId(options.id))
}

/**
 * Delete a previously uploaded file. Accepts the handle itself (preferred —
 * the provider-literal type rejects a foreign provider's handle at compile
 * time) or its raw lifecycle id.
 *
 * @throws if the provider's files adapter has no `delete` (e.g. fal storage).
 */
export async function deleteFile<TName extends string>(options: {
  adapter: FilesAdapter<TName> & { kind: typeof kind }
  id: string | FileHandle<TName>
}): Promise<void> {
  const { adapter } = options
  if (!adapter.delete) {
    throw new Error(
      `${adapter.name}: files adapter does not support delete() — this ` +
        `provider has no file-deletion API.`,
    )
  }
  return adapter.delete(toLifecycleId(options.id))
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
export function fileSourceFromHandle<TProvider extends string>(
  handle: FileHandle<TProvider>,
): ContentPartFileSource<TProvider> {
  return {
    type: 'file',
    value: handle.uri ?? handle.id,
    provider: handle.provider,
    ...(handle.mimeType ? { mimeType: handle.mimeType } : {}),
  }
}

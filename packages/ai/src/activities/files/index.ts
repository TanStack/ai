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
 * Build a `{ type: 'file' }` content source from one or more uploaded
 * {@link FileHandle}s, for use in a chat message (image/audio/document part
 * `source`).
 *
 * Each handle contributes a `reference` entry under its provider name, using
 * the right wire form: the handle URL when the provider exposes one
 * (Gemini/fal), otherwise the opaque id (OpenAI/Anthropic). Pass handles from
 * several providers (the same bytes uploaded to each) to build a source that
 * routes correctly to any of them.
 *
 * @example
 * ```ts
 * const openaiHandle = await uploadFile({ adapter: openaiFiles(), input })
 * const geminiHandle = await uploadFile({ adapter: geminiFiles(), input })
 * messages.push({ role: 'user', content: [
 *   { type: 'image', source: fileSourceFromHandle(openaiHandle, geminiHandle) },
 * ] })
 * ```
 */
export function fileSourceFromHandle<TProvider extends string>(
  ...handles: [FileHandle<TProvider>, ...Array<FileHandle<TProvider>>]
): ContentPartFileSource<TProvider> {
  const reference = {} as Record<TProvider, string>
  let mimeType: string | undefined
  for (const handle of handles) {
    reference[handle.provider] = handle.uri ?? handle.id
    mimeType ??= handle.mimeType
  }
  return {
    type: 'file',
    reference,
    ...(mimeType ? { mimeType } : {}),
  }
}

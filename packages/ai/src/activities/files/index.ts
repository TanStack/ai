/**
 * Files Activity
 *
 * Dispatch functions for provider Files APIs. Each takes `{ adapter, ... }` and
 * calls the adapter method directly (mirrors the other activity dispatchers).
 * `get`/`delete` are optional on the adapter; the dispatchers throw a clear
 * error when the selected provider has no lifecycle API.
 */

import { raceWithAbort } from '../../utilities/activity-abort'
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
  /** Cancels the upload. The call rejects when the signal aborts. */
  abortSignal?: AbortSignal
}): Promise<FileHandle<TName>> {
  const { adapter } = options
  return withAbort(
    adapter.upload.bind(adapter),
    options.input,
    options.abortSignal,
  )
}

/**
 * Run an adapter call with `{ abortSignal }` only when there is a signal, and
 * reject on abort even if the adapter ignores the signal.
 */
function withAbort<TArg, T>(
  call: (arg: TArg, options?: { abortSignal?: AbortSignal }) => Promise<T>,
  arg: TArg,
  abortSignal: AbortSignal | undefined,
): Promise<T> {
  return raceWithAbort(
    abortSignal ? call(arg, { abortSignal }) : call(arg),
    abortSignal,
  )
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
  // `NoInfer` so `TName` comes from the adapter only. Otherwise a foreign
  // handle widens it to a union and the call compiles.
  id: string | FileHandle<NoInfer<TName>>
  /** Cancels the request. The call rejects when the signal aborts. */
  abortSignal?: AbortSignal
}): Promise<FileHandle<TName>> {
  const { adapter } = options
  const get = adapter.get?.bind(adapter)
  if (!get) {
    throw new Error(
      `${adapter.name}: files adapter does not support get() — this provider ` +
        `has no file-retrieval API.`,
    )
  }
  return withAbort(get, toLifecycleId(options.id), options.abortSignal)
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
  id: string | FileHandle<NoInfer<TName>>
  /** Cancels the request. The call rejects when the signal aborts. */
  abortSignal?: AbortSignal
}): Promise<void> {
  const { adapter } = options
  const remove = adapter.delete?.bind(adapter)
  if (!remove) {
    throw new Error(
      `${adapter.name}: files adapter does not support delete() — this ` +
        `provider has no file-deletion API.`,
    )
  }
  return withAbort(remove, toLifecycleId(options.id), options.abortSignal)
}

/**
 * Build a `{ type: 'file' }` content source from an uploaded
 * {@link FileHandle}, for use in a chat message (image/audio/document part
 * `source`).
 *
 * The source's `value` is the handle's wire form: the handle URL when the
 * provider exposes one (Gemini, fal, Grok), otherwise the opaque id (OpenAI,
 * Anthropic). `provider` records the issuer, so an adapter for a different
 * provider rejects the source rather than sending a handle it cannot resolve.
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

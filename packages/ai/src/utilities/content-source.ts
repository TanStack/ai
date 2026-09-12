import type { ContentPartFileSource, ContentPartSource } from '../types'

/**
 * Narrow a {@link ContentPartSource} to the provider-file-reference arm.
 *
 * Issuer adapters use this to route a file source to their native wire field;
 * everyone else is protected by the core preflight (see
 * {@link assertMessagesFileSourceSupport}) plus a defensive throw at their own
 * mapping site.
 */
export function isFileSource(
  source: ContentPartSource,
): source is ContentPartFileSource {
  return source.type === 'file'
}

/**
 * Resolve the wire reference `providerName` should send for a file source.
 *
 * A file source carries a record of per-provider references (`{ openai:
 * 'file-abc', gemini: 'https://…' }`) — upload the same bytes to several
 * providers and merge their handles to make one source usable across all of
 * them. An adapter only ever reads its own entry.
 *
 * @throws when the record has no entry for `providerName` — the file was
 * never uploaded to this provider.
 */
export function fileReferenceFor(
  source: ContentPartFileSource,
  providerName: string,
): string {
  const reference = source.reference[providerName]
  if (reference === undefined) {
    const available = Object.keys(source.reference)
    throw new Error(
      `${providerName}: file source has no reference for this provider ` +
        `(found: ${available.length > 0 ? available.join(', ') : 'none'}). ` +
        `A provider file reference only works with the provider that issued ` +
        `it — upload the file with ${providerName}Files() and merge that ` +
        `handle into the source, or pass a data/url source instead.`,
    )
  }
  return reference
}

/**
 * Build the standard error a non-issuer adapter throws when it encounters a
 * `{ type: 'file' }` source it can't consume — either because the provider has
 * no file-reference input surface, or because the endpoint requires raw bytes
 * (image edits, Veo) rather than a reference.
 *
 * @param detail Optional context appended to the message (e.g. a modality or
 * endpoint name, or a pointer to the adapter that does support references).
 * When provided it replaces the generic remediation tail, so a site-specific
 * hint ("pass inline bytes") is never contradicted by generic advice.
 */
export function unsupportedFileSourceError(
  providerName: string,
  detail?: string,
): Error {
  return new Error(
    `${providerName} does not support provider file-handle sources ` +
      `({ type: 'file' })` +
      (detail
        ? ` ${detail}.`
        : `. Pass a data or url source, or upload via the provider's files ` +
          `adapter where supported.`),
  )
}

/**
 * The slice of an adapter the file-source preflight reads. Adapters that can
 * consume `{ type: 'file' }` sources declare `supportsFileSources: true`;
 * everything else — including adapters written before this arm existed —
 * fails closed at the activity layer instead of falling through to a
 * URL/data branch and silently mis-mapping the reference.
 */
export interface FileSourceCapable {
  name: string
  supportsFileSources?: boolean
}

/** True when a content-part-like value carries a `{ type: 'file' }` source. */
function partHasFileSource(part: unknown): boolean {
  if (typeof part !== 'object' || part === null) return false
  const source = (part as { source?: unknown }).source
  return (
    typeof source === 'object' &&
    source !== null &&
    (source as { type?: unknown }).type === 'file'
  )
}

/**
 * True when `value` is a content part with a file source, or an array
 * (possibly nested — fused embedding items) that contains one.
 */
function inputHasFileSource(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(inputHasFileSource)
  return partHasFileSource(value)
}

/**
 * Fail-closed preflight for media prompts and embedding inputs
 * (`generateImage` / `generateVideo` / `embed`): throws when the input
 * carries a `{ type: 'file' }` source and the adapter hasn't declared
 * `supportsFileSources`. Runs in the activity dispatcher — the same layer
 * that validates modality — so an adapter that predates the file arm can
 * never receive one. Walks a single part, an array of parts, and nested
 * arrays (fused embedding items).
 */
export function assertPromptFileSourceSupport(
  adapter: FileSourceCapable,
  prompt: unknown,
): void {
  if (adapter.supportsFileSources === true) return
  if (inputHasFileSource(prompt)) {
    throw unsupportedFileSourceError(adapter.name)
  }
}

/**
 * Fail-closed preflight for chat messages: throws when any message content
 * part carries a `{ type: 'file' }` source and the adapter hasn't declared
 * `supportsFileSources`. See {@link assertPromptFileSourceSupport}.
 */
export function assertMessagesFileSourceSupport(
  adapter: FileSourceCapable,
  messages: ReadonlyArray<unknown>,
): void {
  if (adapter.supportsFileSources === true) return
  for (const message of messages) {
    if (typeof message !== 'object' || message === null) continue
    const content = (message as { content?: unknown }).content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (partHasFileSource(part)) {
        throw unsupportedFileSourceError(adapter.name)
      }
    }
  }
}

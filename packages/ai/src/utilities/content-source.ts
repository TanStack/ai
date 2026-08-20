import type { ContentPartFileSource, ContentPartSource } from '../types'

/**
 * Narrow a {@link ContentPartSource} to the provider-file-handle arm.
 *
 * Every adapter that maps a content part's `source` onto a provider wire format
 * must handle `{ type: 'file' }` explicitly — either mapping it to the provider's
 * native file-reference field (issuers) or rejecting it (everyone else). Using
 * this guard keeps that branch consistent across the ~dozen adapter packages.
 */
export function isFileSource(
  source: ContentPartSource,
): source is ContentPartFileSource {
  return source.type === 'file'
}

/**
 * Assert that a file source's handle was issued by `providerName`. A provider
 * file handle is only valid for the provider that created it (an OpenAI
 * `file-...` id sent to Gemini is a bug), so issuer adapters call this before
 * mapping the handle onto their wire format.
 *
 * @throws if `source.provider` doesn't match `providerName`.
 */
export function assertOwnFileSource(
  source: ContentPartFileSource,
  providerName: string,
): void {
  if (source.provider !== providerName) {
    throw new Error(
      `${providerName}: file source references a handle issued by ` +
        `"${source.provider}" — a provider file handle only works with the ` +
        `provider that created it. Upload the file with ${providerName}Files() ` +
        `and reference that handle, or pass a data/url source instead.`,
    )
  }
}

/**
 * Build the standard error a non-issuer adapter throws when it encounters a
 * `{ type: 'file' }` source it can't consume — either because the provider has
 * no file-handle input surface, or because the endpoint requires raw bytes
 * (image edits, Veo) rather than a reference.
 *
 * @param detail Optional context appended to the message (e.g. a modality or
 * endpoint name, or a pointer to the adapter that does support handles).
 */
export function unsupportedFileSourceError(
  providerName: string,
  detail?: string,
): Error {
  return new Error(
    `${providerName} does not support provider file-handle sources ` +
      `({ type: 'file' })${detail ? ` ${detail}` : ''}. Pass a data or url ` +
      `source, or upload via the provider's files adapter where supported.`,
  )
}

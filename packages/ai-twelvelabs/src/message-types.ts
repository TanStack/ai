import type { DefaultMessageMetadataByModality } from '@tanstack/ai'

/**
 * Supported video MIME types for TwelveLabs.
 *
 * @see https://docs.twelvelabs.io/v1.3/docs/concepts/supported-file-types
 */
export type TwelveLabsVideoMimeType =
  | 'video/mp4'
  | 'video/quicktime'
  | 'video/webm'
  | 'video/x-msvideo'
  | 'video/mpeg'

/**
 * Metadata for TwelveLabs video content parts. The MIME type is optional —
 * TwelveLabs infers it server-side from the supplied URL or asset.
 */
export interface TwelveLabsVideoMetadata {
  mimeType?: TwelveLabsVideoMimeType
}

/**
 * Per-modality message metadata for TwelveLabs. Pegasus is a video
 * understanding model, so only the `video` modality carries provider metadata;
 * the rest fall back to the framework defaults.
 */
export interface TwelveLabsMessageMetadataByModality extends DefaultMessageMetadataByModality {
  video: TwelveLabsVideoMetadata
}

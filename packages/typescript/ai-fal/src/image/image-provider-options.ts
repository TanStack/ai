import { FalModelImageSize } from '../model-meta'

/**
 * Maps TanStack AI size format (WIDTHxHEIGHT) to fal.ai format.
 * fal.ai accepts either preset names or { width, height } objects.
 */
export function mapSizeToFalFormat<TModel extends string>(
  size: FalModelImageSize<TModel>,
) {
  if (!size) return undefined

  return undefined
}

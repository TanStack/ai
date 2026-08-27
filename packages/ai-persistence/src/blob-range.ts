import type { BlobRange } from './types'

export function resolveBlobRange(
  size: number,
  range: BlobRange,
): { offset: number; length: number } {
  const { offset } = range
  if (!Number.isInteger(offset) || offset < 0 || offset >= size) {
    throw new RangeError(
      `Blob range offset ${offset} is outside the object (size ${size}).`,
    )
  }
  const remaining = size - offset
  if (range.length === undefined) return { offset, length: remaining }
  if (!Number.isInteger(range.length) || range.length < 0) {
    throw new RangeError(`Blob range length ${range.length} is not valid.`)
  }
  return { offset, length: Math.min(range.length, remaining) }
}

export function parseRangeHeader(
  header: string | null | undefined,
  size: number,
): BlobRange | 'unsatisfiable' | undefined {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? '')
  if (!match) return undefined
  const [, rawStart, rawEnd] = match
  // `bytes=-` names nothing at all.
  const isEmptyRange = rawStart === '' && rawEnd === ''
  if (isEmptyRange) return undefined

  if (rawStart === '') {
    const suffix = Number(rawEnd)
    const isUnsatisfiableSuffix = suffix === 0 || size === 0
    if (isUnsatisfiableSuffix) return 'unsatisfiable'
    return { offset: Math.max(0, size - suffix) }
  }

  const start = Number(rawStart)
  const end = rawEnd === '' ? undefined : Number(rawEnd)
  const isInvertedRange = end !== undefined && end < start
  if (isInvertedRange) return undefined
  if (start >= size) return 'unsatisfiable'
  if (end === undefined) return { offset: start }
  // `end` is inclusive, and past the end of the object it simply clamps.
  return { offset: start, length: Math.min(end, size - 1) - start + 1 }
}

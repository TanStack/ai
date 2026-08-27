export function firstNumber(...candidates: Array<unknown>): number | undefined {
  for (const candidate of candidates) {
    const candidate2 =
      typeof candidate === 'number' && Number.isFinite(candidate)
    if (candidate2) {
      return candidate
    }
  }
  return undefined
}

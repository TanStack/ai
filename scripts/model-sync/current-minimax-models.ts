/** Keep legacy ids in the SDK catalog, but offer current MiniMax text models first. */
export function currentMiniMaxModels(ids: Array<string>): Array<string> {
  const current = ids.filter(
    (id) =>
      id === 'minimax/minimax-m3.1-flash:free' ||
      id === 'minimax/minimax-m3.1-flash' ||
      id === 'minimax/minimax-m3',
  )
  current.sort(
    (a, b) =>
      Number(a.endsWith('/minimax-m3')) - Number(b.endsWith('/minimax-m3')),
  )
  let inserted = false
  return ids.flatMap((id) => {
    if (!id.startsWith('minimax/')) return [id]
    if (inserted) return []
    inserted = true
    return current
  })
}

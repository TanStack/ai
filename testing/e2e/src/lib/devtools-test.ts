export interface DevtoolsRouteSearch {
  testId?: string
  aimockPort?: number
}

export function parseDevtoolsRouteSearch(
  search: Record<string, unknown>,
): DevtoolsRouteSearch {
  const aimockPort =
    typeof search.aimockPort === 'string'
      ? Number.parseInt(search.aimockPort, 10)
      : undefined

  return {
    ...(typeof search.testId === 'string' ? { testId: search.testId } : {}),
    ...(aimockPort !== undefined && !Number.isNaN(aimockPort)
      ? { aimockPort }
      : {}),
  }
}

export function devtoolsRouteSearch(search: DevtoolsRouteSearch): string {
  const params = new URLSearchParams()
  if (search.testId) params.set('testId', search.testId)
  if (search.aimockPort) params.set('aimockPort', String(search.aimockPort))
  const query = params.toString()
  return query ? `?${query}` : ''
}

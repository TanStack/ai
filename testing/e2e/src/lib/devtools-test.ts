export interface DevtoolsRouteSearch {
  testId?: string
  aimockPort?: number
}

export function parseAimockPort(value: unknown): number | undefined {
  const port =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : undefined
  return port != null && !Number.isNaN(port) ? port : undefined
}

export function parseDevtoolsRouteSearch(
  search: Record<string, unknown>,
): DevtoolsRouteSearch {
  const aimockPort = parseAimockPort(search.aimockPort)

  return {
    ...(typeof search.testId === 'string' ? { testId: search.testId } : {}),
    ...(aimockPort !== undefined ? { aimockPort } : {}),
  }
}

export function devtoolsRouteSearch(search: DevtoolsRouteSearch): string {
  const params = new URLSearchParams()
  if (search.testId) params.set('testId', search.testId)
  if (search.aimockPort) params.set('aimockPort', String(search.aimockPort))
  const query = params.toString()
  return query ? `?${query}` : ''
}

import type { JSONObject } from './types'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** For values from `JSON.parse` or a JSON-RPC result, which hold only JSON. */
export function isJsonObject(value: unknown): value is JSONObject {
  return isRecord(value)
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

export function issues(message: string) {
  return { issues: [{ message }] }
}

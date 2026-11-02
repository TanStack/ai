function appendField(form: FormData, key: string, value: unknown) {
  if (value === undefined || value === null) return
  if (value instanceof Blob) form.append(key, value)
  else if (Array.isArray(value)) {
    for (const item of value) appendField(form, key, item)
  } else if (typeof value === 'object') form.append(key, JSON.stringify(value))
  else form.append(key, String(value))
}

/**
 * Builds a native `FormData` for a multipart upload.
 *
 * - A `File` or `Blob` is sent as it is (a `File` keeps its name).
 * - An array adds one field per item, with the same key.
 * - Strings, numbers, and booleans become strings (`true` -> `'true'`).
 * - Other objects become a JSON string.
 * - `undefined` and `null` are skipped.
 *
 * @example
 * toFormData({ file, model: 'whisper-1', 'timestamp_granularities[]': ['word'] })
 */
export function toFormData(fields: Record<string, unknown>) {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    appendField(form, key, value)
  }
  return form
}

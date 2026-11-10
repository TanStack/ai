/**
 * The `_meta` that the request-meta MCP server got, in order. The server
 * route and the wire route run in the same dev-server process, so a
 * module-level array is enough.
 */
const records: Array<{ method: string; meta: unknown }> = []

/** Adds the `_meta` of one MCP request. */
export function recordMeta(method: string, meta: unknown) {
  records.push({ method, meta })
}

/** Returns all records and clears the log. */
export function takeMeta() {
  return records.splice(0)
}

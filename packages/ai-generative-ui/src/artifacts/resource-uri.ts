/**
 * `ui://` resource identity for Frame-tier artifacts — the MCP Apps (SEP-1865)
 * resource scheme. An artifact revision addresses as `ui://genui/<id>@<rev>`;
 * the MIME type is the MCP Apps profile. These let an artifact flow through the
 * standard `ui-resource` host path (in-app via the middleware, or over MCP via
 * the server adapter) instead of only our bespoke pin.
 */

/** MCP Apps UI-resource MIME type (ext-apps `RESOURCE_MIME_TYPE`). */
export const MCP_APP_MIME_TYPE = 'text/html;profile=mcp-app'

/** Authority segment of our `ui://` artifact URIs. */
export const ARTIFACT_URI_AUTHORITY = 'genui'

/** `ui://genui/<artifactId>@<revision>` for a pinned revision. */
export function artifactResourceUri(
  artifactId: string,
  revision: number,
): string {
  return `ui://${ARTIFACT_URI_AUTHORITY}/${artifactId}@${revision}`
}

/** `ui://genui/<artifactId>` (latest) — a resource template target. */
export function artifactResourceTemplate(): string {
  return `ui://${ARTIFACT_URI_AUTHORITY}/{artifactId}@{revision}`
}

/** Parse a `ui://genui/<id>@<rev>` URI, or `null` if it isn't one of ours. */
export function parseArtifactResourceUri(
  uri: string,
): { artifactId: string; revision: number } | null {
  const prefix = `ui://${ARTIFACT_URI_AUTHORITY}/`
  if (!uri.startsWith(prefix)) return null
  const rest = uri.slice(prefix.length)
  const at = rest.lastIndexOf('@')
  if (at < 0) return null
  const artifactId = rest.slice(0, at)
  const revision = Number(rest.slice(at + 1))
  if (!artifactId || !Number.isFinite(revision)) return null
  return { artifactId, revision }
}

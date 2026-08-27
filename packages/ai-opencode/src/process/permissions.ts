import { approvalId } from '@tanstack/ai-sandbox'

export type OpencodePermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'bypassPermissions'

/** Structural subset of an OpenCode `permission.updated` payload. */
export interface OpencodePermissionRequest {
  id: string
  sessionID: string
  /** Permission category, e.g. `'edit'`, `'bash'`, `'webfetch'`, a tool id. */
  type: string
  title: string
  /** Tool call id this permission gates, when it gates a tool. */
  callID?: string
}

/** OpenCode permission reply: allow once, allow always, or reject. */
export type OpencodePermissionResponse = 'once' | 'always' | 'reject'

/** Custom permission handler; replaces the adapter's default policy. */
export type PermissionHandler = (
  request: OpencodePermissionRequest,
) => Promise<OpencodePermissionResponse> | OpencodePermissionResponse

/** Permission categories treated as file mutations for `'acceptEdits'`. */
const EDIT_TYPES = new Set(['edit', 'write', 'patch'])

export function matchBridgedToolName(
  request: OpencodePermissionRequest,
  bridgedToolNames: ReadonlySet<string> | undefined,
): boolean {
  if (!bridgedToolNames) return false
  if (bridgedToolNames.size === 0) return false
  for (const field of [request.type, request.title]) {
    if (typeof field !== 'string') continue
    if (field === '') continue
    if (bridgedToolNames.has(field)) return true
    const underscoredAlias =
      field.startsWith('tanstack_') && bridgedToolNames.has(field.slice(9))
    if (underscoredAlias) {
      return true
    }
    const dottedAlias =
      field.startsWith('tanstack.') && bridgedToolNames.has(field.slice(9))
    if (dottedAlias) {
      return true
    }
  }
  return false
}

export function resolvePermission(
  request: OpencodePermissionRequest,
  mode: OpencodePermissionMode,
  bridgedToolNames: ReadonlySet<string> | undefined,
): OpencodePermissionResponse {
  if (matchBridgedToolName(request, bridgedToolNames)) {
    return 'once'
  }
  if (mode === 'bypassPermissions') {
    return 'once'
  }
  const allowEdit = mode === 'acceptEdits' && EDIT_TYPES.has(request.type)
  if (allowEdit) {
    return 'once'
  }
  return 'reject'
}

export function resolveInteractivePermission(
  request: OpencodePermissionRequest,
  mode: OpencodePermissionMode,
  bridgedToolNames: ReadonlySet<string> | undefined,
  approvals: ReadonlyMap<string, boolean> | undefined,
): {
  response: OpencodePermissionResponse
  approvalId?: string
  title?: string
} {
  if (matchBridgedToolName(request, bridgedToolNames))
    return { response: 'once' }
  if (mode === 'bypassPermissions') return { response: 'once' }
  const allowEdit = mode === 'acceptEdits' && EDIT_TYPES.has(request.type)
  if (allowEdit) {
    return { response: 'once' }
  }

  const id = approvalId({
    provider: 'opencode',
    kind: 'tool',
    target: request.type || request.title,
  })
  const granted = approvals?.get(id)
  if (granted === true) return { response: 'once' }
  if (granted === false) return { response: 'reject' }
  return { response: 'reject', approvalId: id, title: request.title }
}

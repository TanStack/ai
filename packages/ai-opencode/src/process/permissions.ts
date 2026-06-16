import { approvalId } from '@tanstack/ai-sandbox'

/**
 * Permission modes for the OpenCode adapter, mirroring the Claude Code and
 * Gemini CLI adapters' semantics:
 *
 * - `'default'`: bridged TanStack tools run; anything else that asks for
 *   permission is rejected with no prompt (a headless server must never hang
 *   on an interactive question).
 * - `'acceptEdits'`: additionally auto-approves file-mutation requests
 *   (edit / write / patch).
 * - `'bypassPermissions'`: approves everything.
 */
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

/**
 * Decide whether an OpenCode permission request targets one of the bridged
 * TanStack tools. OpenCode names MCP tools `<server>_<tool>` (e.g.
 * `tanstack_lookup_user`), so a request is bridged when its type or title is
 * a registered tool name, or carries the `tanstack` server prefix.
 */
export function matchBridgedToolName(
  request: OpencodePermissionRequest,
  bridgedToolNames: ReadonlySet<string> | undefined,
): boolean {
  if (!bridgedToolNames || bridgedToolNames.size === 0) return false
  for (const field of [request.type, request.title]) {
    if (typeof field !== 'string' || field === '') continue
    if (bridgedToolNames.has(field)) return true
    if (field.startsWith('tanstack_') && bridgedToolNames.has(field.slice(9))) {
      return true
    }
    if (field.startsWith('tanstack.') && bridgedToolNames.has(field.slice(9))) {
      return true
    }
  }
  return false
}

/**
 * The adapter's default permission policy. Always answers immediately — never
 * hangs a headless server on a question only an interactive user could
 * answer.
 */
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
  if (mode === 'acceptEdits' && EDIT_TYPES.has(request.type)) {
    return 'once'
  }
  return 'reject'
}

/**
 * Interactive variant: when the mode/bridge policy would reject, consult the
 * client's approval decisions. Returns the OpenCode response plus, when the
 * action still needs a client decision, the `approvalId`/`title` the adapter
 * should surface via an `approval-requested` event.
 */
export function resolveInteractivePermission(
  request: OpencodePermissionRequest,
  mode: OpencodePermissionMode,
  bridgedToolNames: ReadonlySet<string> | undefined,
  approvals: ReadonlyMap<string, boolean> | undefined,
): { response: OpencodePermissionResponse; approvalId?: string; title?: string } {
  if (matchBridgedToolName(request, bridgedToolNames)) return { response: 'once' }
  if (mode === 'bypassPermissions') return { response: 'once' }
  if (mode === 'acceptEdits' && EDIT_TYPES.has(request.type)) {
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

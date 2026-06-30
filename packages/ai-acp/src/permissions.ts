import { approvalId } from '@tanstack/ai-sandbox'
import { matchBridgedToolName } from './stream/translate'
import type {
  AcpPermissionMode,
  AcpPermissionOutcome,
  AcpPermissionRequest,
  PermissionHandler,
} from './types/acp-types'

export type { AcpPermissionMode, PermissionHandler }

const EDIT_KINDS = new Set(['edit', 'move', 'delete'])

function pickOption(
  request: AcpPermissionRequest,
  kinds: Array<string>,
): AcpPermissionOutcome {
  for (const kind of kinds) {
    const option = request.options.find((candidate) => candidate.kind === kind)
    if (option) return { outcome: 'selected', optionId: option.optionId }
  }
  return { outcome: 'cancelled' }
}

export function resolvePermission(
  request: AcpPermissionRequest,
  mode: AcpPermissionMode,
  bridgedToolNames: ReadonlySet<string> | undefined,
): AcpPermissionOutcome {
  const allow = () => pickOption(request, ['allow_once', 'allow_always'])
  const reject = () => pickOption(request, ['reject_once', 'reject_always'])

  if (
    matchBridgedToolName(request.toolCall.title, bridgedToolNames) !== undefined
  ) {
    return allow()
  }
  if (mode === 'bypassPermissions') return allow()
  if (mode === 'acceptEdits' && EDIT_KINDS.has(request.toolCall.kind ?? '')) {
    return allow()
  }
  return reject()
}

export function resolveInteractivePermission(
  request: AcpPermissionRequest,
  mode: AcpPermissionMode,
  bridgedToolNames: ReadonlySet<string> | undefined,
  approvals: ReadonlyMap<string, boolean> | undefined,
  provider: string,
): { outcome: AcpPermissionOutcome; approvalId?: string; title?: string } {
  const allow = (): AcpPermissionOutcome =>
    pickOption(request, ['allow_once', 'allow_always'])
  const reject = (): AcpPermissionOutcome =>
    pickOption(request, ['reject_once', 'reject_always'])
  const title = request.toolCall.title ?? request.toolCall.toolCallId

  if (matchBridgedToolName(title, bridgedToolNames) !== undefined) {
    return { outcome: allow() }
  }
  if (mode === 'bypassPermissions') return { outcome: allow() }
  if (mode === 'acceptEdits' && EDIT_KINDS.has(request.toolCall.kind ?? '')) {
    return { outcome: allow() }
  }

  const id = approvalId({ provider, kind: 'tool', target: title })
  const granted = approvals?.get(id)
  if (granted === true) return { outcome: allow() }
  if (granted === false) return { outcome: reject() }
  return { outcome: reject(), approvalId: id, title }
}

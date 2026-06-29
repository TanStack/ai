import { matchBridgedToolName } from '../stream/translate'
import type {
  AcpPermissionOutcome,
  AcpPermissionRequest,
} from '../stream/acp-types'

/**
 * Permission modes for the Gemini CLI adapter, mirroring the Claude Code
 * adapter's semantics:
 *
 * - `'default'`: bridged TanStack tools run; anything else that asks for
 *   permission is rejected with no prompt (a headless server must never
 *   hang on an interactive question).
 * - `'acceptEdits'`: additionally auto-approves file-mutation tools
 *   (edit / move / delete kinds).
 * - `'bypassPermissions'`: approves everything.
 */
export type GeminiCliPermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'bypassPermissions'

/** Custom permission handler; replaces the adapter's default policy. */
export type PermissionHandler = (
  request: AcpPermissionRequest,
) => Promise<AcpPermissionOutcome> | AcpPermissionOutcome

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

/**
 * The adapter's default permission policy. Always answers immediately —
 * never hangs a headless server on a question only an interactive user
 * could answer.
 */
export function resolvePermission(
  request: AcpPermissionRequest,
  mode: GeminiCliPermissionMode,
  bridgedToolNames: ReadonlySet<string> | undefined,
): AcpPermissionOutcome {
  const allow = () => pickOption(request, ['allow_once', 'allow_always'])
  const reject = () => pickOption(request, ['reject_once', 'reject_always'])

  if (
    matchBridgedToolName(request.toolCall.title, bridgedToolNames) !== undefined
  ) {
    return allow()
  }
  if (mode === 'bypassPermissions') {
    return allow()
  }
  if (mode === 'acceptEdits' && EDIT_KINDS.has(request.toolCall.kind ?? '')) {
    return allow()
  }
  return reject()
}

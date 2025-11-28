import { useChatContext } from './chat'
import type { JSX } from 'solid-js'

export interface ToolApprovalProps {
  /** Tool call ID */
  toolCallId: string
  /** Tool name */
  toolName: string
  /** Parsed tool arguments/input */
  input: any
  /** Approval metadata */
  approval: {
    id: string
    needsApproval: boolean
    approved?: boolean
  }
  /** CSS class name */
  class?: string
  /** Custom render prop */
  children?: (props: ToolApprovalRenderProps) => JSX.Element
}

export interface ToolApprovalRenderProps {
  /** Tool name */
  toolName: string
  /** Parsed input */
  input: any
  /** Approve the tool call */
  onApprove: () => void
  /** Deny the tool call */
  onDeny: () => void
  /** Whether user has responded */
  hasResponded: boolean
  /** User's decision (if responded) */
  approved?: boolean
}

/**
 * Tool approval component - renders approve/deny buttons for tools that need approval
 *
 * @example
 * ```tsx
 * {part.approval && (
 *   <ToolApproval
 *     toolCallId={part.id}
 *     toolName={part.name}
 *     input={JSON.parse(part.arguments)}
 *     approval={part.approval}
 *   />
 * )}
 * ```
 */
export function ToolApproval(props: ToolApprovalProps) {
  const { addToolApprovalResponse } = useChatContext()

  const handleApprove = () => {
    addToolApprovalResponse({
      id: props.approval.id,
      approved: true,
    })
  }

  const handleDeny = () => {
    addToolApprovalResponse({
      id: props.approval.id,
      approved: false,
    })
  }

  const hasResponded = () => props.approval.approved !== undefined

  const renderProps = (): ToolApprovalRenderProps => ({
    toolName: props.toolName,
    input: props.input,
    onApprove: handleApprove,
    onDeny: handleDeny,
    hasResponded: hasResponded(),
    approved: props.approval.approved,
  })

  // Render prop pattern
  if (props.children) {
    return <>{props.children(renderProps())}</>
  }

  // Already responded - show decision
  if (hasResponded()) {
    return (
      <div
        class={props.class}
        data-tool-approval
        data-approval-status={props.approval.approved ? 'approved' : 'denied'}
      >
        {props.approval.approved ? '✓ Approved' : '✗ Denied'}
      </div>
    )
  }

  // Default approval UI
  return (
    <div class={props.class} data-tool-approval data-approval-status="pending">
      <div data-approval-header>
        <strong>{props.toolName}</strong> requires approval
      </div>
      <div data-approval-input>
        <pre>{JSON.stringify(props.input, null, 2)}</pre>
      </div>
      <div data-approval-actions>
        <button onClick={handleApprove} data-approval-approve>
          Approve
        </button>
        <button onClick={handleDeny} data-approval-deny>
          Deny
        </button>
      </div>
    </div>
  )
}

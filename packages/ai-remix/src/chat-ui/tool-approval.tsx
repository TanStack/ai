import { on } from 'remix/ui'
import type { Handle, RemixNode } from 'remix/ui'
import { useChatContext } from './chat.tsx'

export interface ToolApprovalRenderProps {
  toolName: string
  input: unknown
  onApprove: () => void
  onDeny: () => void
  hasResponded: boolean
  approved?: boolean
}

export interface ToolApprovalProps {
  toolCallId: string
  toolName: string
  input: unknown
  approval: {
    id: string
    needsApproval: boolean
    approved?: boolean
  }
  class?: string
  children?: (props: ToolApprovalRenderProps) => RemixNode
}

export function ToolApproval(handle: Handle<ToolApprovalProps>) {
  return () => {
    const { addToolApprovalResponse } = useChatContext(handle)
    const approval = handle.props.approval

    function onApprove() {
      void addToolApprovalResponse({ id: approval.id, approved: true })
    }

    function onDeny() {
      void addToolApprovalResponse({ id: approval.id, approved: false })
    }

    const hasResponded = approval.approved !== undefined
    const renderProps: ToolApprovalRenderProps = {
      toolName: handle.props.toolName,
      input: handle.props.input,
      onApprove,
      onDeny,
      hasResponded,
      approved: approval.approved,
    }

    if (typeof handle.props.children === 'function') {
      return handle.props.children(renderProps)
    }

    if (hasResponded) {
      return (
        <div
          class={handle.props.class}
          data-approval-status={approval.approved ? 'approved' : 'denied'}
          data-tool-approval
        >
          {approval.approved ? 'Approved' : 'Denied'}
        </div>
      )
    }

    return (
      <div
        class={handle.props.class}
        data-approval-status="pending"
        data-tool-approval
      >
        <div data-approval-header>
          <strong>{handle.props.toolName}</strong> requires approval
        </div>
        <div data-approval-input>
          <pre>{JSON.stringify(handle.props.input, null, 2)}</pre>
        </div>
        <div data-approval-actions>
          <button data-approval-approve mix={[on('click', onApprove)]}>
            Approve
          </button>
          <button data-approval-deny mix={[on('click', onDeny)]}>
            Deny
          </button>
        </div>
      </div>
    )
  }
}

import type { ReactNode } from "react";
import { useChatContext } from "./chat";

export interface ToolApprovalProps {
  /** Tool call ID */
  toolCallId: string;
  /** Tool name */
  toolName: string;
  /** Parsed tool arguments/input */
  input: any;
  /** Approval metadata */
  approval: {
    id: string;
    needsApproval: boolean;
    approved?: boolean;
  };
  /** CSS class name */
  className?: string;
  /** Custom render prop */
  children?: (props: ToolApprovalRenderProps) => ReactNode;
}

export interface ToolApprovalRenderProps {
  /** Tool name */
  toolName: string;
  /** Parsed input */
  input: any;
  /** Approve the tool call */
  onApprove: () => void;
  /** Deny the tool call */
  onDeny: () => void;
  /** Whether user has responded */
  hasResponded: boolean;
  /** User's decision (if responded) */
  approved?: boolean;
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
export function ToolApproval({
  toolCallId,
  toolName,
  input,
  approval,
  className,
  children,
}: ToolApprovalProps) {
  const { addToolApprovalResponse } = useChatContext();

  const handleApprove = () => {
    addToolApprovalResponse({
      id: approval.id,
      approved: true,
    });
  };

  const handleDeny = () => {
    addToolApprovalResponse({
      id: approval.id,
      approved: false,
    });
  };

  const hasResponded = approval.approved !== undefined;

  const renderProps: ToolApprovalRenderProps = {
    toolName,
    input,
    onApprove: handleApprove,
    onDeny: handleDeny,
    hasResponded,
    approved: approval.approved,
  };

  // Render prop pattern
  if (children) {
    return <>{children(renderProps)}</>;
  }

  // Already responded - show decision
  if (hasResponded) {
    return (
      <div
        className={className}
        data-tool-approval
        data-approval-status={approval.approved ? "approved" : "denied"}
      >
        {approval.approved ? "✓ Approved" : "✗ Denied"}
      </div>
    );
  }

  // Default approval UI
  return (
    <div
      className={className}
      data-tool-approval
      data-approval-status="pending"
    >
      <div data-approval-header>
        <strong>{toolName}</strong> requires approval
      </div>
      <div data-approval-input>
        <pre>{JSON.stringify(input, null, 2)}</pre>
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
  );
}


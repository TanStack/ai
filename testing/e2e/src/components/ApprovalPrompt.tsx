interface ApprovalPart {
  type: 'approval-requested'
  id: string
  toolName: string
  args: Record<string, any>
}

export function ApprovalPrompt({
  part,
  onRespond,
}: {
  part: ApprovalPart
  onRespond: (response: { id: string; approved: boolean }) => Promise<void>
}) {
  return (
    <div data-testid={`approval-prompt-${part.toolName}`} className="my-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded">
      <div className="text-sm text-yellow-300 mb-2">
        Tool <span className="font-mono font-bold">{part.toolName}</span> requires approval
      </div>
      <div className="text-xs text-gray-400 mb-2">
        Args: <code>{JSON.stringify(part.args)}</code>
      </div>
      <div className="flex gap-2">
        <button
          data-testid={`approve-button-${part.toolName}`}
          onClick={() => onRespond({ id: part.id, approved: true })}
          className="px-3 py-1 bg-green-600 text-white rounded text-xs"
        >
          Approve
        </button>
        <button
          data-testid={`deny-button-${part.toolName}`}
          onClick={() => onRespond({ id: part.id, approved: false })}
          className="px-3 py-1 bg-red-600 text-white rounded text-xs"
        >
          Deny
        </button>
      </div>
    </div>
  )
}

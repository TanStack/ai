interface ToolCallPart {
  type: 'tool-call'
  toolName: string
  args: Record<string, any>
  result?: any
}

export function ToolCallDisplay({ part }: { part: ToolCallPart }) {
  return (
    <div
      data-testid={`tool-call-${part.toolName}`}
      className="my-2 p-2 bg-gray-900/50 border border-gray-700 rounded text-xs"
    >
      <div className="font-mono text-orange-400">{part.toolName}</div>
      <div className="text-gray-400 mt-1">
        Args: <code>{JSON.stringify(part.args)}</code>
      </div>
      {part.result !== undefined && (
        <div
          data-testid={`tool-call-result-${part.toolName}`}
          className="text-gray-300 mt-1"
        >
          Result:{' '}
          <code>
            {typeof part.result === 'string'
              ? part.result
              : JSON.stringify(part.result)}
          </code>
        </div>
      )}
    </div>
  )
}

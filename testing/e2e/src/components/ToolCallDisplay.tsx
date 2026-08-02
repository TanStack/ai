export function ToolCallDisplay({ part }: { part: any }) {
  return (
    <div
      data-testid={`tool-call-${part.name}`}
      className="my-2 p-2 bg-gray-900/50 border border-gray-700 rounded text-xs"
    >
      <div className="font-mono text-orange-400">{part.name}</div>
      <div className="text-gray-400 mt-1">
        Args: <code>{part.arguments}</code>
      </div>
      {/* Parsed, typed input — populated once the arguments are complete. */}
      <div
        data-testid={`tool-call-input-${part.name}`}
        className="text-gray-400 mt-1"
      >
        Input:{' '}
        <code>
          {part.input === undefined ? '' : JSON.stringify(part.input)}
        </code>
      </div>
    </div>
  )
}

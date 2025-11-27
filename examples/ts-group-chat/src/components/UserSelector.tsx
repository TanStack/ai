interface UserSelectorProps {
  username: string
  onUsernameChange: (username: string) => void
  isConnected: boolean
}

export function UserSelector({
  username,
  onUsernameChange,
  isConnected,
}: UserSelectorProps) {
  const personas = [
    { value: 'Alice', label: '👩 Alice' },
    { value: 'Bob', label: '👨 Bob' },
    { value: 'Charlie', label: '🧑 Charlie' },
    { value: 'Diana', label: '👩‍🦰 Diana' },
  ]

  if (!isConnected) {
    return (
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-600">
        <div className="flex items-center justify-center text-gray-400">
          <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full mr-2"></div>
          Connecting to chat server...
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-800 p-4 rounded-lg border border-gray-600">
      <div className="flex items-center space-x-3">
        <label
          htmlFor="user-selector"
          className="text-white font-medium whitespace-nowrap"
        >
          Select User:
        </label>
        <select
          id="user-selector"
          value={username}
          onChange={(e) => onUsernameChange(e.target.value)}
          className="flex-1 bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 focus:outline-none focus:border-blue-500"
        >
          <option value="">Choose a persona...</option>
          {personas.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        {username && <div className="text-green-400 text-sm">✓</div>}
      </div>
      {!username && (
        <p className="text-gray-400 text-xs mt-2">
          💡 Choose a user to start chatting
        </p>
      )}
    </div>
  )
}

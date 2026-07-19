import type { ClaudeMode } from '../../chat-server/chat-api'

interface OnlineUsersProps {
  onlineUsers: string[]
  currentUsername: string | null
  claudeMode?: ClaudeMode
}

export function OnlineUsers({
  onlineUsers,
  currentUsername,
  claudeMode = 'passive',
}: OnlineUsersProps) {
  return (
    <div className="bg-gray-800 p-6 rounded-lg border border-gray-600">
      <h2 className="text-xl font-bold mb-4 text-white flex items-center">
        <span className="text-green-400 mr-2">●</span>
        Online Users ({onlineUsers.length})
      </h2>

      {onlineUsers.length === 0 ? (
        <div className="text-gray-400 text-center py-4">No users online</div>
      ) : (
        <div className="space-y-2">
          {onlineUsers.map((username) => (
            <div
              key={username}
              className={`flex items-center p-2 rounded ${
                username === currentUsername
                  ? 'bg-blue-800 border border-blue-600'
                  : 'bg-gray-700'
              }`}
            >
              <div className="w-2 h-2 bg-green-400 rounded-full mr-3"></div>
              <span className="text-white">
                {username}
                {username === currentUsername && (
                  <span className="text-blue-400 text-sm ml-2">(you)</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-gray-600">
        <h3 className="text-sm font-semibold text-white mb-2">How to use</h3>
        <div className="text-xs text-gray-400 space-y-1">
          <p>
            • Add/remove todos in the panel, or ask Claude to manage them
          </p>
          {claudeMode === 'passive' ? (
            <p>
              • Type <span className="text-purple-400">@Claude</span> to add,
              remove, or ask about todos
            </p>
          ) : (
            <p>
              • Active mode: Claude watches for todo intent (no{' '}
              <span className="text-purple-400">@Claude</span> needed)
            </p>
          )}
          <p>• Messages are sent to all online users</p>
        </div>
        <div className="mt-3 pt-3 border-t border-gray-700 text-xs text-gray-500 text-center">
          Real-time presence via Cap'n Web RPC
        </div>
      </div>
    </div>
  )
}

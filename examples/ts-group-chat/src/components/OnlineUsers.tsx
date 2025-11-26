interface OnlineUsersProps {
  onlineUsers: string[];
  currentUsername: string | null;
}

export function OnlineUsers({
  onlineUsers,
  currentUsername,
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
                  ? "bg-blue-800 border border-blue-600"
                  : "bg-gray-700"
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

      <div className="mt-4 pt-4 border-t border-gray-600 text-xs text-gray-400 text-center">
        Real-time presence via Cap'n Web RPC
      </div>
    </div>
  );
}

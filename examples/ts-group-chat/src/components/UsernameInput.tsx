import { useState } from "react";

interface UsernameInputProps {
  username: string;
  onUsernameChange: (username: string) => void;
  isConnected: boolean;
}

export function UsernameInput({
  username,
  onUsernameChange,
  isConnected,
}: UsernameInputProps) {
  const [tempUsername, setTempUsername] = useState(username);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tempUsername.trim()) {
      onUsernameChange(tempUsername.trim());
    }
  };

  const handleUsernameChange = (value: string) => {
    setTempUsername(value);
    // Only update username when user finishes typing (on blur or enter)
  };

  if (!isConnected) {
    return (
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-600">
        <div className="flex items-center justify-center text-gray-400">
          <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full mr-2"></div>
          Connecting to chat server...
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 p-4 rounded-lg border border-gray-600">
      <form onSubmit={handleSubmit} className="flex items-center space-x-3">
        <label
          htmlFor="username"
          className="text-white font-medium whitespace-nowrap"
        >
          Your name:
        </label>
        <input
          id="username"
          type="text"
          value={tempUsername}
          onChange={(e) => handleUsernameChange(e.target.value)}
          onBlur={(e) => {
            const value = e.target.value.trim();
            if (value) {
              onUsernameChange(value);
            } else {
              onUsernameChange("");
            }
          }}
          placeholder="Enter your username"
          className="flex-1 bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 focus:outline-none focus:border-blue-500"
          maxLength={20}
        />
        {username && <div className="text-green-400 text-sm">✓</div>}
      </form>
      {!username && (
        <p className="text-gray-400 text-xs mt-2">
          💡 Choose a username to start chatting
        </p>
      )}
    </div>
  );
}

import { Component, For } from "solid-js";
import { useStyles } from "../styles/use-styles";

const mockMessages = [
  {
    id: "msg-1",
    role: "user",
    content: "What is TanStack AI?",
    timestamp: new Date().toISOString(),
  },
  {
    id: "msg-2",
    role: "assistant",
    content: "TanStack AI is a powerful SDK...",
    timestamp: new Date().toISOString(),
  },
  {
    id: "msg-3",
    role: "system",
    content: "You are a helpful assistant.",
    timestamp: new Date().toISOString(),
  },
];

export const MessagesList: Component<{
  selectedKey: () => string | null;
  setSelectedKey: (key: string | null) => void;
}> = (props) => {
  const styles = useStyles();

  return (
    <div class={styles().utilList}>
      <For
        each={mockMessages}
        children={(message) => (
          <div
            class={`${styles().utilRow} ${props.selectedKey() === message.id ? styles().utilRowSelected : ""}`}
            onClick={() => props.setSelectedKey(message.id)}
          >
            <div class={styles().utilKey}>
              <strong>{message.role}:</strong> {message.content.substring(0, 50)}...
            </div>
            <div class={styles().utilStatus}>{new Date(message.timestamp).toLocaleTimeString()}</div>
          </div>
        )}
      />
    </div>
  );
};

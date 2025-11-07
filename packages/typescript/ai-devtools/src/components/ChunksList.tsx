import { Component, For } from "solid-js";
import { useStyles } from "../styles/use-styles";

const mockChunks = [
  { id: "chunk-1", type: "content", role: "assistant", content: "Hello", detail: "Text chunk" },
  { id: "chunk-2", type: "tool_call", role: "assistant", toolName: "searchWeb", detail: "Tool invocation" },
  { id: "chunk-3", type: "tool_result", role: "tool", toolName: "searchWeb", detail: "Results returned" },
  { id: "chunk-4", type: "done", finishReason: "stop", detail: "Completion finished" },
];

export const ChunksList: Component<{
  selectedKey: () => string | null;
  setSelectedKey: (key: string | null) => void;
}> = (props) => {
  const styles = useStyles();

  return (
    <div class={styles().utilList}>
      <div class={styles().actionsRow} style={{ "margin-bottom": "12px" }}>
        <button class={styles().actionButton}>
          <div class={styles().actionDotGreen} />
          Export to TypeScript
        </button>
        <button class={styles().actionButton}>
          <div class={styles().actionDotRed} />
          Clear Chunks
        </button>
      </div>

      <For
        each={mockChunks}
        children={(chunk) => (
          <div
            class={`${styles().utilRow} ${props.selectedKey() === chunk.id ? styles().utilRowSelected : ""}`}
            onClick={() => props.setSelectedKey(chunk.id)}
          >
            <div class={styles().utilKey}>
              <strong>{chunk.type}</strong>
              {chunk.toolName && ` - ${chunk.toolName}`}
            </div>
            <div class={styles().utilStatus}>{chunk.detail}</div>
          </div>
        )}
      />
    </div>
  );
};

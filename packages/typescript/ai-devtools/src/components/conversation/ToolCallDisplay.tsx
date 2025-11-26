import { Component, Show } from "solid-js";
import { useStyles } from "../../styles/use-styles";
import type { ToolCall } from "../../store/ai-store";

interface ToolCallDisplayProps {
  tool: ToolCall;
}

export const ToolCallDisplay: Component<ToolCallDisplayProps> = (props) => {
  const styles = useStyles();
  const tool = () => props.tool;

  return (
    <div
      class={`${styles().conversationDetails.toolCall} ${
        tool().approvalRequired
          ? styles().conversationDetails.toolCallApproval
          : styles().conversationDetails.toolCallNormal
      }`}
    >
      <div class={styles().conversationDetails.toolCallHeader}>
        <div
          class={`${styles().conversationDetails.toolCallName} ${
            tool().approvalRequired
              ? styles().conversationDetails.toolCallNameApproval
              : styles().conversationDetails.toolCallNameNormal
          }`}
        >
          {tool().approvalRequired ? "⚠️" : "🔧"} {tool().name}
        </div>
        <div
          class={`${styles().conversationDetails.toolStateBadge} ${
            tool().approvalRequired
              ? styles().conversationDetails.toolStateBadgeApproval
              : styles().conversationDetails.toolStateBadgeNormal
          }`}
        >
          {tool().state}
        </div>
        <Show when={tool().approvalRequired}>
          <div class={styles().conversationDetails.approvalRequiredBadge}>APPROVAL REQUIRED</div>
        </Show>
      </div>
      <Show when={tool().arguments}>
        <div class={styles().conversationDetails.toolArguments}>{tool().arguments}</div>
      </Show>
    </div>
  );
};

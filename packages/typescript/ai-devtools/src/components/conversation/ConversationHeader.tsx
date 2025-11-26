import { Component, For, Show, createSignal } from "solid-js";
import { useStyles } from "../../styles/use-styles";
import type { Conversation } from "../../store/ai-store";
import { formatDuration } from "../utils";

interface ConversationHeaderProps {
  conversation: Conversation;
}

export const ConversationHeader: Component<ConversationHeaderProps> = (props) => {
  const styles = useStyles();
  const conv = () => props.conversation;
  const [showOptions, setShowOptions] = createSignal(false);

  const hasExtendedInfo = () => {
    const c = conv();
    return (
      (c.toolNames && c.toolNames.length > 0) ||
      (c.options && Object.keys(c.options).length > 0) ||
      (c.providerOptions && Object.keys(c.providerOptions).length > 0)
    );
  };

  const toolNames = () => conv().toolNames ?? [];
  const options = () => conv().options;
  const providerOptions = () => conv().providerOptions;

  return (
    <div class={styles().panelHeader}>
      <div class={styles().conversationDetails.headerContent}>
        <div class={styles().conversationDetails.headerRow}>
          <div class={styles().conversationDetails.headerLabel}>{conv().label}</div>
          <div
            class={`${styles().conversationDetails.statusBadge} ${
              conv().status === "active"
                ? styles().conversationDetails.statusActive
                : conv().status === "completed"
                ? styles().conversationDetails.statusCompleted
                : styles().conversationDetails.statusError
            }`}
          >
            {conv().status}
          </div>
        </div>
        <div class={styles().conversationDetails.metaInfo}>
          {conv().model && `Model: ${conv().model}`}
          {conv().provider && ` • Provider: ${conv().provider}`}
          {conv().completedAt && ` • Duration: ${formatDuration(conv().completedAt! - conv().startedAt)}`}
        </div>
        <Show when={conv().usage}>
          <div class={styles().conversationDetails.usageInfo}>
            <span class={styles().conversationDetails.usageLabel}>🎯 Tokens:</span>
            <span>Prompt: {conv().usage?.promptTokens.toLocaleString() || 0}</span>
            <span>•</span>
            <span>Completion: {conv().usage?.completionTokens.toLocaleString() || 0}</span>
            <span>•</span>
            <span class={styles().conversationDetails.usageBold}>
              Total: {conv().usage?.totalTokens.toLocaleString() || 0}
            </span>
          </div>
        </Show>
        <Show when={hasExtendedInfo()}>
          <button class={styles().conversationDetails.toggleButton} onClick={() => setShowOptions(!showOptions())}>
            {showOptions() ? "▼ Hide Details" : "▶ Show Details"}
          </button>
          <Show when={showOptions()}>
            <div class={styles().conversationDetails.extendedInfo}>
              <Show when={toolNames().length > 0}>
                <div class={styles().conversationDetails.infoSection}>
                  <span class={styles().conversationDetails.infoLabel}>🔧 Tools:</span>
                  <div class={styles().conversationDetails.toolsList}>
                    <For each={toolNames()}>
                      {(toolName) => <span class={styles().conversationDetails.toolBadge}>{toolName}</span>}
                    </For>
                  </div>
                </div>
              </Show>
              <Show when={options()}>
                {(opts) => (
                  <Show when={Object.keys(opts()).length > 0}>
                    <div class={styles().conversationDetails.infoSection}>
                      <span class={styles().conversationDetails.infoLabel}>⚙️ Options:</span>
                      <pre class={styles().conversationDetails.jsonPreview}>{JSON.stringify(opts(), null, 2)}</pre>
                    </div>
                  </Show>
                )}
              </Show>
              <Show when={providerOptions()}>
                {(provOpts) => (
                  <Show when={Object.keys(provOpts()).length > 0}>
                    <div class={styles().conversationDetails.infoSection}>
                      <span class={styles().conversationDetails.infoLabel}>🏷️ Provider Options:</span>
                      <pre class={styles().conversationDetails.jsonPreview}>{JSON.stringify(provOpts(), null, 2)}</pre>
                    </div>
                  </Show>
                )}
              </Show>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
};
